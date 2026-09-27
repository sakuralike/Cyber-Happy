import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { removeFile } from '../lib/storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_EVENT_RETENTION_DAYS = 180;
const DEFAULT_AUDIT_RETENTION_DAYS = 180;
const DEFAULT_MEDIA_RETENTION_DAYS = 180;
const DEFAULT_DISPATCH_RETENTION_DAYS = 180;
const DEFAULT_METRIC_RETENTION_DAYS = 730;
const MAX_LATENCY_SAMPLES = 10_000;
const TICK_MS = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface DailyMetricJobOptions {
  batchSize?: number;
  maxLatencySamples?: number;
}

export interface RetentionCleanupOptions {
  now?: Date;
  batchSize?: number;
  eventRetentionDays?: number;
  auditRetentionDays?: number;
  mediaRetentionDays?: number;
  dispatchRetentionDays?: number;
  metricRetentionDays?: number;
}

export interface DailyMetricCleanupResult {
  appEvents: number;
  auditLogs: number;
  fileAssets: number;
  dispatchLogs: number;
  dailyMetrics: number;
}

export interface DailyMetricRunResult {
  aggregated: number;
  cleaned: DailyMetricCleanupResult;
}

function shanghaiDateKey(value: Date): string {
  const shifted = new Date(value.getTime() + SHANGHAI_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function startOfShanghaiDay(value: Date): Date {
  const key = shanghaiDateKey(value);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!) - SHANGHAI_OFFSET_MS);
}

function startOfMetricDay(value: Date | string): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const result = new Date(Date.UTC(year!, month! - 1, day!) - SHANGHAI_OFFSET_MS);
    if (shanghaiDateKey(result) !== value) throw new Error('Invalid metric date');
    return result;
  }
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid metric date');
  return startOfShanghaiDay(parsed);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function eventRange(day: Date) {
  return { gte: day, lt: addDays(day, 1) };
}

async function latencyAverage(
  day: Date,
  batchSize: number,
  maxSamples: number,
): Promise<number> {
  let cursor: string | undefined;
  let samples = 0;
  let weightedMs = 0;

  while (samples < maxSamples) {
    const requested = Math.min(batchSize, maxSamples - samples);
    const rows = await prisma.appEvent.findMany({
      where: {
        eventType: 'MODEL_CALL',
        occurredAt: eventRange(day),
      },
      select: { id: true, payload: true, count: true },
      orderBy: { id: 'asc' },
      take: requested,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;

    for (const row of rows) {
      let value: unknown;
      try {
        const payload = JSON.parse(row.payload) as { inferenceMs?: unknown; latencyMs?: unknown };
        value = payload.inferenceMs ?? payload.latencyMs;
      } catch {
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      const weight = Math.max(1, row.count);
      const accepted = Math.min(weight, maxSamples - samples);
      weightedMs += value * accepted;
      samples += accepted;
      if (samples >= maxSamples) break;
    }

    if (rows.length < requested) break;
    cursor = rows[rows.length - 1]!.id;
  }

  return samples > 0 ? Math.round(weightedMs / samples) : 0;
}

/** Rebuild one UTC day by replacement, so retries never increment old values. */
export async function aggregateDailyMetric(
  dayInput: Date | string,
  options: DailyMetricJobOptions = {},
): Promise<{ date: string; created: boolean }> {
  const day = startOfMetricDay(dayInput);
  const range = eventRange(day);
  const batchSize = positiveInt(options.batchSize, DEFAULT_BATCH_SIZE);
  const maxLatencySamples = positiveInt(options.maxLatencySamples, MAX_LATENCY_SAMPLES);

  const [launches, activeDevices, calls, triggers, crashes, newUsers, mauRows, misreports, latency] = await Promise.all([
    prisma.appEvent.findMany({ where: { eventType: 'LAUNCH', occurredAt: range }, select: { deviceId: true } }),
    prisma.appUser.count({ where: { lastActiveAt: range } }),
    prisma.appEvent.aggregate({ where: { eventType: 'MODEL_CALL', occurredAt: range }, _sum: { count: true } }),
    prisma.appEvent.aggregate({ where: { eventType: 'TRIGGER', occurredAt: range }, _sum: { count: true } }),
    prisma.appEvent.aggregate({ where: { eventType: 'CRASH', occurredAt: range }, _sum: { count: true } }),
    prisma.appUser.count({ where: { firstSeenAt: range } }),
    prisma.appEvent.findMany({
      where: {
        eventType: 'LAUNCH',
        occurredAt: { gte: addDays(day, -29), lt: addDays(day, 1) },
      },
      select: { deviceId: true },
      distinct: ['deviceId'],
    }),
    prisma.misreport.count({ where: { reportedAt: range } }),
    latencyAverage(day, batchSize, maxLatencySamples),
  ]);

  const triggerCount = triggers._sum.count ?? 0;
  const misreportRate = triggerCount > 0 ? Number((misreports / triggerCount).toFixed(4)) : 0;
  const existing = await prisma.dailyMetric.findUnique({ where: { date: day }, select: { id: true } });
  const values = {
    dau: new Set(launches.map((row) => row.deviceId)).size,
    mau: mauRows.length,
    newUsers,
    activeDevices,
    modelCallCount: calls._sum.count ?? 0,
    triggerCount,
    misreportCount: misreports,
    misreportRate,
    crashCount: crashes._sum.count ?? 0,
    avgInferenceMs: latency,
  };
  await prisma.dailyMetric.upsert({
    where: { date: day },
    create: { date: day, ...values },
    update: values,
  });
  return { date: shanghaiDateKey(day), created: !existing };
}

export async function backfillDailyMetrics(
  fromInput: Date | string,
  toInput: Date | string = fromInput,
  options: DailyMetricJobOptions = {},
): Promise<{ processed: number; created: number; updated: number }> {
  const from = startOfMetricDay(fromInput);
  const to = startOfMetricDay(toInput);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('Invalid metric date range');
  }
  let processed = 0;
  let created = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const result = await aggregateDailyMetric(day, options);
    processed += 1;
    if (result.created) created += 1;
  }
  return { processed, created, updated: processed - created };
}

async function deleteByCursor<T extends { id: string }>(
  findBatch: (cursor: string | undefined) => Promise<T[]>,
  deleteBatch: (ids: string[]) => Promise<number>,
  batchSize: number,
): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  while (true) {
    const rows = await findBatch(cursor);
    if (!rows.length) break;
    const ids = rows.map((row) => row.id);
    deleted += await deleteBatch(ids);
    cursor = ids[ids.length - 1];
    if (rows.length < batchSize) break;
  }
  return deleted;
}

export async function cleanupRetainedData(options: RetentionCleanupOptions = {}): Promise<DailyMetricCleanupResult> {
  const now = options.now ?? new Date();
  const batchSize = positiveInt(options.batchSize, DEFAULT_BATCH_SIZE);
  const retentionCutoff = (days: number | undefined, fallback: number) =>
    new Date(now.getTime() - positiveInt(days, fallback) * DAY_MS);
  const eventCutoff = retentionCutoff(options.eventRetentionDays, DEFAULT_EVENT_RETENTION_DAYS);
  const auditCutoff = retentionCutoff(options.auditRetentionDays, DEFAULT_AUDIT_RETENTION_DAYS);
  const mediaCutoff = retentionCutoff(options.mediaRetentionDays, DEFAULT_MEDIA_RETENTION_DAYS);
  const dispatchCutoff = retentionCutoff(options.dispatchRetentionDays, DEFAULT_DISPATCH_RETENTION_DAYS);
  const metricCutoff = retentionCutoff(options.metricRetentionDays, DEFAULT_METRIC_RETENTION_DAYS);

  const appEvents = await deleteByCursor(
    (cursor) => prisma.appEvent.findMany({
      where: { occurredAt: { lt: eventCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: batchSize,
    }),
    async (ids) => (await prisma.appEvent.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );
  const auditLogs = await deleteByCursor(
    (cursor) => prisma.auditLog.findMany({
      where: { createdAt: { lt: auditCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: batchSize,
    }),
    async (ids) => (await prisma.auditLog.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );
  const dispatchLogs = await deleteByCursor(
    (cursor) => prisma.deviceDispatchLog.findMany({
      where: { createdAt: { lt: dispatchCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: batchSize,
    }),
    async (ids) => (await prisma.deviceDispatchLog.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );
  const dailyMetrics = await deleteByCursor(
    (cursor) => prisma.dailyMetric.findMany({
      where: { date: { lt: metricCutoff }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: 'asc' }, take: batchSize,
    }),
    async (ids) => (await prisma.dailyMetric.deleteMany({ where: { id: { in: ids } } })).count,
    batchSize,
  );
  let fileAssets = 0;
  let assetCursor: string | undefined;
  while (true) {
    const candidates = await prisma.fileAsset.findMany({
      where: {
        OR: [
          { status: { in: ['DELETED', 'EXPIRED'] }, createdAt: { lt: mediaCutoff } },
          { retentionUntil: { lte: now } },
        ],
        ...(assetCursor ? { id: { gt: assetCursor } } : {}),
      },
      select: { id: true, storagePath: true, url: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!candidates.length) break;
    assetCursor = candidates[candidates.length - 1]!.id;
    for (const asset of candidates) {
      const [downloadLinks, banners, appVersions, models, siteConfig, users, misreports, landingModules] = await Promise.all([
        prisma.downloadLink.count({ where: { OR: [{ fileId: asset.id }, { qrFileId: asset.id }] } }),
        prisma.banner.count({ where: { imageFileId: asset.id } }),
        prisma.appVersion.count({ where: { apkFileId: asset.id } }),
        prisma.mlModel.count({ where: { fileId: asset.id } }),
        prisma.siteConfig.count({ where: { apkFileId: asset.id } }),
        prisma.userAccount.count({ where: { avatarFileId: asset.id } }),
        prisma.misreport.count({
          where: {
            OR: [
              { thumbnailUrl: { contains: asset.id } },
              { thumbnailUrl: { contains: asset.url } },
              { snapshotUrls: { contains: asset.id } },
              { snapshotUrls: { contains: asset.url } },
              { videoUrl: { contains: asset.id } },
              { videoUrl: { contains: asset.url } },
            ],
          },
        }),
        prisma.landingModule.count({
          where: { OR: [{ contentJson: { contains: asset.id } }, { contentJson: { contains: asset.url } }] },
        }),
      ]);
      if (downloadLinks + banners + appVersions + models + siteConfig + users + misreports + landingModules > 0) continue;
      await removeFile(asset.storagePath);
      fileAssets += (await prisma.fileAsset.deleteMany({ where: { id: asset.id } })).count;
    }
    if (candidates.length < batchSize) break;
  }
  return { appEvents, auditLogs, fileAssets, dispatchLogs, dailyMetrics };
}

export async function runDailyMetrics(now = new Date()): Promise<DailyMetricRunResult> {
  await aggregateDailyMetric(addDays(now, -1));
  const cleaned = await cleanupRetainedData({ now });
  return { aggregated: 1, cleaned };
}

let timer: NodeJS.Timeout | null = null;

export function startDailyMetricWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runDailyMetrics().catch((error) => logger.error({ error }, '[daily-metrics] job failed'));
  }, TICK_MS);
  timer.unref();
  void runDailyMetrics().catch((error) => logger.error({ error }, '[daily-metrics] initial run failed'));
}

export function stopDailyMetricWorker(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

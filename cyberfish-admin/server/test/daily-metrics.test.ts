import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'cyberfish-daily-metrics-'));
const testDatabase = join(testDir, 'daily-metrics.db');
const databasePath = `./${relative(join(serverDir, 'prisma'), testDatabase).replaceAll('\\', '/')}`;
writeFileSync(testDatabase, '');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${databasePath}`;

let prisma: any;
let metrics: typeof import('../src/jobs/daily-metrics');

const day = new Date('2026-09-20T00:00:00.000Z');
const storedMetricDate = new Date(day.getTime() - 8 * 60 * 60 * 1000);
const at = (offsetHours: number) => new Date(day.getTime() + offsetHours * 60 * 60 * 1000);

async function createEvent(data: Record<string, unknown>) {
  return prisma.appEvent.create({
    data: {
      deviceId: 'device-a',
      eventType: 'LAUNCH',
      count: 1,
      payload: '{}',
      occurredAt: at(1),
      ...data,
    },
  });
}

before(async () => {
  const prismaCli = join(serverDir, '..', 'node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  metrics = await import('../src/jobs/daily-metrics');
  await prisma.appEvent.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.misreport.deleteMany();
  await prisma.dailyMetric.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deviceDispatchLog.deleteMany();
  await prisma.modelDispatch.deleteMany();
  await prisma.mlModel.deleteMany();
  await prisma.downloadLink.deleteMany();
  await prisma.fileAsset.deleteMany();
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('daily metrics', { concurrency: false }, () => {
  it('rebuilds a day idempotently and updates changed source events', async () => {
    await prisma.appUser.create({
      data: { deviceId: 'device-a', firstSeenAt: at(1), lastActiveAt: at(6) },
    });
    await prisma.appUser.create({
      data: { deviceId: 'device-b', firstSeenAt: at(2), lastActiveAt: at(4) },
    });
    await createEvent({ deviceId: 'device-a', eventType: 'LAUNCH' });
    await createEvent({ deviceId: 'device-a', eventType: 'LAUNCH', occurredAt: at(2) });
    await createEvent({ deviceId: 'device-b', eventType: 'LAUNCH', occurredAt: at(3) });
    await createEvent({ deviceId: 'device-a', eventType: 'MODEL_CALL', count: 3, payload: JSON.stringify({ inferenceMs: 100 }) });
    await createEvent({ deviceId: 'device-b', eventType: 'MODEL_CALL', count: 2, payload: JSON.stringify({ latencyMs: 50 }), occurredAt: at(2) });
    await createEvent({ deviceId: 'device-a', eventType: 'TRIGGER', count: 4 });
    await createEvent({ deviceId: 'device-a', eventType: 'CRASH', count: 1 });

    const first = await metrics.aggregateDailyMetric(day, { batchSize: 2 });
    const firstRow = await prisma.dailyMetric.findUnique({ where: { date: storedMetricDate } });
    assert.equal(first.created, true);
    assert.deepEqual(
      {
        dau: firstRow.dau,
        mau: firstRow.mau,
        newUsers: firstRow.newUsers,
        activeDevices: firstRow.activeDevices,
        modelCallCount: firstRow.modelCallCount,
        triggerCount: firstRow.triggerCount,
        crashCount: firstRow.crashCount,
        avgInferenceMs: firstRow.avgInferenceMs,
      },
      { dau: 2, mau: 2, newUsers: 2, activeDevices: 2, modelCallCount: 5, triggerCount: 4, crashCount: 1, avgInferenceMs: 80 },
    );

    const second = await metrics.aggregateDailyMetric(day, { batchSize: 2 });
    const secondRow = await prisma.dailyMetric.findUnique({ where: { date: storedMetricDate } });
    assert.equal(second.created, false);
    assert.equal(secondRow.modelCallCount, 5);
    assert.equal(await prisma.dailyMetric.count(), 1);

    await createEvent({ deviceId: 'device-b', eventType: 'MODEL_CALL', count: 1, payload: JSON.stringify({ inferenceMs: 20 }) });
    await metrics.aggregateDailyMetric(day, { batchSize: 2 });
    const rebuilt = await prisma.dailyMetric.findUnique({ where: { date: storedMetricDate } });
    assert.equal(rebuilt.modelCallCount, 6);
    assert.equal(rebuilt.avgInferenceMs, 70);
  });

  it('backfills each requested date and reports created versus updated rows', async () => {
    const nextDay = new Date(day.getTime() + 2 * 24 * 60 * 60 * 1000);
    await createEvent({ deviceId: 'device-c', eventType: 'LAUNCH', occurredAt: nextDay });
    const result = await metrics.backfillDailyMetrics(day, nextDay, { batchSize: 2 });
    assert.deepEqual(result, { processed: 3, created: 2, updated: 1 });
    assert.equal(await prisma.dailyMetric.count(), 3);
    const rerun = await metrics.backfillDailyMetrics(day, nextDay, { batchSize: 2 });
    assert.deepEqual(rerun, { processed: 3, created: 0, updated: 3 });
  });

  it('cleans old rows in cursor-sized batches and protects referenced media', async () => {
    await prisma.appEvent.deleteMany();
    await prisma.dailyMetric.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.deviceDispatchLog.deleteMany();
    await prisma.modelDispatch.deleteMany();
    await prisma.mlModel.deleteMany();
    await prisma.downloadLink.deleteMany();
    await prisma.fileAsset.deleteMany();
    const now = new Date('2026-09-30T00:00:00.000Z');
    const old = new Date('2026-09-01T00:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      await createEvent({ deviceId: `old-${i}`, occurredAt: old });
    }
    await createEvent({ deviceId: 'fresh', occurredAt: new Date('2026-09-29T00:00:00.000Z') });
    await prisma.auditLog.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ module: 'TEST', action: `OLD_${i}`, operatorName: 'test', createdAt: old })),
    });
    const model = await prisma.mlModel.create({ data: { modelVersion: 'metric-model', name: 'Metric model' } });
    const dispatch = await prisma.modelDispatch.create({ data: { modelId: model.id, targetType: 'GLOBAL', targetValue: '{}' } });
    await prisma.deviceDispatchLog.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ dispatchId: dispatch.id, deviceId: `dispatch-${i}`, toModelVersion: 'metric-model', createdAt: old })),
    });
    const deletableAsset = await prisma.fileAsset.create({
      data: {
        bizType: 'IMAGE', originalName: 'old.jpg', filename: 'old.jpg', storagePath: 'old.jpg',
        url: '/files/old.jpg', mimeType: 'image/jpeg', size: 10, sha256: `old-${Date.now()}`,
        status: 'DELETED', createdAt: old,
      },
    });
    const protectedAsset = await prisma.fileAsset.create({
      data: {
        bizType: 'IMAGE', originalName: 'linked.jpg', filename: 'linked.jpg', storagePath: 'linked.jpg',
        url: '/files/linked.jpg', mimeType: 'image/jpeg', size: 10, sha256: `linked-${Date.now()}`,
        status: 'DELETED', createdAt: old,
      },
    });
    await prisma.downloadLink.create({ data: { platform: 'ANDROID', channel: 'metric', mode: 'EXTERNAL', fileId: protectedAsset.id } });
    const result = await metrics.cleanupRetainedData({
      now,
      batchSize: 2,
      eventRetentionDays: 7,
      auditRetentionDays: 7,
      mediaRetentionDays: 7,
      dispatchRetentionDays: 7,
      metricRetentionDays: 7,
    });
    assert.deepEqual(result, { appEvents: 5, auditLogs: 5, fileAssets: 1, dispatchLogs: 5, dailyMetrics: 0 });
    assert.equal(await prisma.appEvent.count({ where: { deviceId: 'fresh' } }), 1);
    assert.equal(await prisma.fileAsset.count({ where: { id: deletableAsset.id } }), 0);
    assert.equal(await prisma.fileAsset.count({ where: { id: protectedAsset.id } }), 1);
    const rerun = await metrics.cleanupRetainedData({
      now,
      batchSize: 2,
      eventRetentionDays: 7,
      auditRetentionDays: 7,
      mediaRetentionDays: 7,
      dispatchRetentionDays: 7,
      metricRetentionDays: 7,
    });
    assert.deepEqual(rerun, { appEvents: 0, auditLogs: 0, fileAssets: 0, dispatchLogs: 0, dailyMetrics: 0 });
  });
});

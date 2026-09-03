import { Prisma } from '@prisma/client';
import { EventType } from '../../lib/enums';
import dayjs from 'dayjs';
import { prisma } from '../../lib/prisma';
import type { DashboardQuery } from './schema';

export interface MetricCard {
  key: string;
  label: string;
  value: number;
  delta: number;
  unit: string;
  threshold?: number;
}

function eventFilter(
  eventType: EventType,
  from: Date,
  to: Date,
  q: DashboardQuery,
): Prisma.AppEventWhereInput {
  return {
    eventType,
    occurredAt: { gte: from, lte: to },
    ...(q.appVersionCode !== undefined ? { appVersionCode: q.appVersionCode } : {}),
    ...(q.modelVersion ? { modelVersion: q.modelVersion } : {}),
  };
}

function calcDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1;
  return Number(((current - previous) / previous).toFixed(4));
}

/** 解析时间范围，默认最近 30 天 */
export function resolveRange(q: DashboardQuery) {
  const to = q.to ? dayjs(q.to).endOf('day').toDate() : dayjs().endOf('day').toDate();
  const from = q.from ? dayjs(q.from).startOf('day').toDate() : dayjs(to).subtract(29, 'day').startOf('day').toDate();
  const days = Math.max(1, dayjs(to).diff(dayjs(from), 'day') + 1);
  const prevTo = dayjs(from).subtract(1, 'day').endOf('day').toDate();
  const prevFrom = dayjs(prevTo).subtract(days - 1, 'day').startOf('day').toDate();
  return { from, to, days, prevFrom, prevTo };
}

export async function overview(q: DashboardQuery) {
  const { from, to, days, prevFrom, prevTo } = resolveRange(q);

  // 当前区间
  const [launchAgg, callAgg, triggerAgg, misreportCount, newUsers, activeDevices] = await Promise.all([
    prisma.appEvent.findMany({
      where: eventFilter(EventType.LAUNCH, from, to, q),
      select: { deviceId: true, occurredAt: true },
    }),
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.MODEL_CALL, from, to, q),
      _sum: { count: true },
    }),
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.TRIGGER, from, to, q),
      _sum: { count: true },
    }),
    prisma.misreport.count({ where: { reportedAt: { gte: from, lte: to } } }),
    prisma.appUser.count({ where: { firstSeenAt: { gte: from, lte: to } } }),
    prisma.appUser.count({
      where: {
        lastActiveAt: { gte: from, lte: to },
        ...(q.appVersionCode !== undefined ? { appVersionCode: q.appVersionCode } : {}),
        ...(q.modelVersion ? { modelVersion: q.modelVersion } : {}),
      },
    }),
  ]);

  // DAU 取区间末日（或今日）的去重设备
  const lastDay = dayjs(to).format('YYYY-MM-DD');
  const dau = new Set(
    launchAgg.filter((e) => dayjs(e.occurredAt).format('YYYY-MM-DD') === lastDay).map((e) => e.deviceId),
  ).size;

  // MAU：末日往前 30 天
  const mauFrom = dayjs(to).subtract(29, 'day').startOf('day').toDate();
  const mauRows = await prisma.appEvent.findMany({
    where: { ...eventFilter(EventType.LAUNCH, mauFrom, to, q) },
    select: { deviceId: true },
    distinct: ['deviceId'],
  });
  const mau = mauRows.length;

  const modelCalls = callAgg._sum.count ?? 0;
  const triggers = triggerAgg._sum.count ?? 0;
  const misreportRate = triggers > 0 ? Number((misreportCount / triggers).toFixed(4)) : 0;

  // ---- 上一周期（环比）----
  const [prevLaunch, prevCallAgg, prevTriggerAgg, prevMisreport, prevNewUsers] = await Promise.all([
    prisma.appEvent.findMany({
      where: eventFilter(EventType.LAUNCH, prevFrom, prevTo, q),
      select: { deviceId: true },
      distinct: ['deviceId'],
    }),
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.MODEL_CALL, prevFrom, prevTo, q),
      _sum: { count: true },
    }),
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.TRIGGER, prevFrom, prevTo, q),
      _sum: { count: true },
    }),
    prisma.misreport.count({ where: { reportedAt: { gte: prevFrom, lte: prevTo } } }),
    prisma.appUser.count({ where: { firstSeenAt: { gte: prevFrom, lte: prevTo } } }),
  ]);

  const prevTriggers = prevTriggerAgg._sum.count ?? 0;
  const prevMisreportRate = prevTriggers > 0 ? prevMisreport / prevTriggers : 0;

  const cards: MetricCard[] = [
    { key: 'dau', label: '日活 DAU', value: dau, delta: calcDelta(dau, prevLaunch.length), unit: '人' },
    { key: 'mau', label: '月活 MAU', value: mau, delta: 0, unit: '人' },
    { key: 'newUsers', label: '新增用户', value: newUsers, delta: calcDelta(newUsers, prevNewUsers), unit: '人' },
    { key: 'modelCalls', label: '模型调用量', value: modelCalls, delta: calcDelta(modelCalls, prevCallAgg._sum.count ?? 0), unit: '次' },
    {
      key: 'misreportRate',
      label: '误报率',
      value: misreportRate,
      delta: Number((misreportRate - prevMisreportRate).toFixed(4)),
      unit: '%',
      threshold: 0.08,
    },
  ];

  return {
    range: { from: dayjs(from).format('YYYY-MM-DD'), to: dayjs(to).format('YYYY-MM-DD'), days },
    cards,
    extra: { activeDevices, triggers, misreportCount },
    updatedAt: new Date().toISOString(),
  };
}

export async function trend(q: DashboardQuery) {
  const { from, to } = resolveRange(q);

  const [launches, newUsers, calls, triggers, misreports] = await Promise.all([
    prisma.appEvent.findMany({
      where: eventFilter(EventType.LAUNCH, from, to, q),
      select: { deviceId: true, occurredAt: true },
    }),
    prisma.appUser.findMany({
      where: { firstSeenAt: { gte: from, lte: to } },
      select: { firstSeenAt: true },
    }),
    prisma.appEvent.findMany({
      where: eventFilter(EventType.MODEL_CALL, from, to, q),
      select: { count: true, occurredAt: true },
    }),
    prisma.appEvent.findMany({
      where: eventFilter(EventType.TRIGGER, from, to, q),
      select: { count: true, occurredAt: true },
    }),
    prisma.misreport.findMany({
      where: { reportedAt: { gte: from, lte: to } },
      select: { reportedAt: true },
    }),
  ]);

  // 按天分桶
  const buckets = new Map<string, { dau: Set<string>; newUsers: number; calls: number; triggers: number; misreports: number }>();
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) {
    buckets.set(d.format('YYYY-MM-DD'), { dau: new Set(), newUsers: 0, calls: 0, triggers: 0, misreports: 0 });
  }
  const bucket = (date: Date) => {
    const key = dayjs(date).format('YYYY-MM-DD');
    return buckets.get(key);
  };

  for (const e of launches) bucket(e.occurredAt)?.dau.add(e.deviceId);
  for (const u of newUsers) {
    const b = bucket(u.firstSeenAt);
    if (b) b.newUsers += 1;
  }
  for (const c of calls) {
    const b = bucket(c.occurredAt);
    if (b) b.calls += c.count;
  }
  for (const t of triggers) {
    const b = bucket(t.occurredAt);
    if (b) b.triggers += t.count;
  }
  for (const m of misreports) {
    const b = bucket(m.reportedAt);
    if (b) b.misreports += 1;
  }

  const series = [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({
      date,
      dau: v.dau.size,
      newUsers: v.newUsers,
      modelCalls: v.calls,
      triggers: v.triggers,
      misreports: v.misreports,
      misreportRate: v.triggers > 0 ? Number((v.misreports / v.triggers).toFixed(4)) : 0,
    }));

  return { granularity: q.granularity, series };
}

export async function versionDistribution(q: DashboardQuery) {
  const where: Prisma.AppUserWhereInput = {
    ...(q.appVersionCode !== undefined ? { appVersionCode: q.appVersionCode } : {}),
    ...(q.modelVersion ? { modelVersion: q.modelVersion } : {}),
  };
  const [grouped, versions, total] = await Promise.all([
    prisma.appUser.groupBy({ by: ['appVersionCode'], where, _count: { _all: true }, orderBy: { appVersionCode: 'desc' } }),
    prisma.appVersion.findMany({ select: { versionCode: true, versionName: true, status: true } }),
    prisma.appUser.count({ where }),
  ]);

  const nameMap = new Map(versions.map((v) => [v.versionCode, v.versionName]));
  const statusMap = new Map(versions.map((v) => [v.versionCode, v.status]));

  return grouped.map((g) => ({
    versionCode: g.appVersionCode,
    versionName: nameMap.get(g.appVersionCode) ?? `v${g.appVersionCode}`,
    status: statusMap.get(g.appVersionCode) ?? null,
    devices: g._count._all,
    ratio: total > 0 ? Number((g._count._all / total).toFixed(4)) : 0,
  }));
}

export async function modelUsage(q: DashboardQuery) {
  const { from, to } = resolveRange(q);
  const grouped = await prisma.appEvent.groupBy({
    by: ['modelVersion'],
    where: eventFilter(EventType.MODEL_CALL, from, to, q),
    _sum: { count: true },
    _avg: { count: true },
    orderBy: { _sum: { count: 'desc' } },
  });

  const total = grouped.reduce((s, g) => s + (g._sum.count ?? 0), 0);
  return {
    total,
    items: grouped.map((g) => ({
      modelVersion: g.modelVersion || 'unknown',
      calls: g._sum.count ?? 0,
      avgPerCall: Number((g._avg.count ?? 0).toFixed(2)),
      ratio: total > 0 ? Number(((g._sum.count ?? 0) / total).toFixed(4)) : 0,
    })),
  };
}

export async function misreportAnalysis(q: DashboardQuery) {
  const { from, to } = resolveRange(q);

  const [reports, triggersAgg] = await Promise.all([
    prisma.misreport.findMany({
      where: { reportedAt: { gte: from, lte: to } },
      select: { reportedAt: true, rootCause: true, reportType: true, modelVersion: true },
    }),
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.TRIGGER, from, to, q),
      _sum: { count: true },
    }),
  ]);

  // 按天误报数
  const byDay = new Map<string, number>();
  for (let d = dayjs(from); !d.isAfter(dayjs(to)); d = d.add(1, 'day')) byDay.set(d.format('YYYY-MM-DD'), 0);
  for (const r of reports) {
    const key = dayjs(r.reportedAt).format('YYYY-MM-DD');
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  // 根因分布
  const rootMap = new Map<string, number>();
  for (const r of reports) {
    const k = r.rootCause ?? 'UNCLASSIFIED';
    rootMap.set(k, (rootMap.get(k) ?? 0) + 1);
  }

  const triggers = triggersAgg._sum.count ?? 0;
  return {
    total: reports.length,
    triggers,
    overallRate: triggers > 0 ? Number((reports.length / triggers).toFixed(4)) : 0,
    trend: [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count })),
    rootCauses: [...rootMap.entries()]
      .map(([rootCause, count]) => ({ rootCause, count, ratio: reports.length ? Number((count / reports.length).toFixed(4)) : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function health(q: DashboardQuery) {
  const { from, to } = resolveRange(q);

  const [crashAgg, launches, inference] = await Promise.all([
    prisma.appEvent.aggregate({
      where: eventFilter(EventType.CRASH, from, to, q),
      _sum: { count: true },
    }),
    prisma.appEvent.findMany({
      where: eventFilter(EventType.LAUNCH, from, to, q),
      select: { deviceId: true },
      distinct: ['deviceId'],
    }),
    prisma.misreport.findMany({
      where: { reportedAt: { gte: from, lte: to } },
      select: { rawData: true },
      take: 500,
    }),
  ]);

  // 从 rawData 中提取 fps / 推理耗时，算 P95
  const latencies: number[] = [];
  for (const r of inference) {
    try {
      const raw = JSON.parse(r.rawData) as { backend?: string; fps?: number };
      if (typeof raw.fps === 'number' && raw.fps > 0) latencies.push(Math.round(1000 / raw.fps));
    } catch {
      /* 忽略非法 JSON */
    }
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] ?? 0 : 0;

  const active = launches.length;
  const crashes = crashAgg._sum.count ?? 0;

  return {
    crashCount: crashes,
    crashRate: active > 0 ? Number((crashes / active).toFixed(4)) : 0,
    activeDevices: active,
    inferenceP95Ms: p95,
    sampleSize: latencies.length,
  };
}

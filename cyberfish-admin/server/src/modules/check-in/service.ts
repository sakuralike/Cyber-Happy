import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { HistoryQuery, RiskEventQuery } from './schema';
import {
  checkInConfig,
  checkInRewardConfig,
  checkInRiskConfig,
} from '../system-settings/service';
import type { CheckInBody } from './schema';

const TIMEZONE = 'Asia/Shanghai';
const CYCLE_LENGTH = 7;

export const DEFAULT_CHECK_IN_CONFIG = {
  enabled: true,
  activityTitle: '每日签到',
  timezone: TIMEZONE,
  dailyWindowEnabled: false,
  dailyWindowStart: '00:00',
  dailyWindowEnd: '23:59',
  activityStartAt: null as string | null,
  activityEndAt: null as string | null,
  announcement: '',
};

const DEFAULT_REWARD_CONFIG = {
  rewardMode: 'BADGE',
  cycleLength: CYCLE_LENGTH,
  cycleStrategy: 'LOOP',
  rewards: [] as Array<{ day: number; type: string; name: string; iconKey: string; milestone: boolean }>,
};

const DEFAULT_RISK_CONFIG = {
  maxDevicePerUser: 3,
  ipRateLimitPerMin: 10,
  suspiciousThreshold: 5,
};

type CheckInRecord = {
  id: string;
  checkinDate: string;
  checkedAt: Date;
  streak: number;
};

function dateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function localDateKey(date: Date): string {
  const parts = dateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localClock(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function shiftDateKey(dateKey: string, days: number): string {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthBounds(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

function cycleDay(streak: number, cycleLength = CYCLE_LENGTH): number {
  return streak > 0 ? ((streak - 1) % cycleLength) + 1 : 0;
}

function recordDto(record: CheckInRecord | null, cycleLength = CYCLE_LENGTH) {
  if (!record) return null;
  return {
    id: record.id,
    date: record.checkinDate,
    checkedAt: record.checkedAt,
    occurredAt: record.checkedAt,
    streak: record.streak,
    cycleDay: cycleDay(record.streak, cycleLength),
  };
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

async function recordRisk(input: {
  userId?: string;
  deviceId?: string;
  ip?: string;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.checkInRiskEvent.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId,
        ip: input.ip,
        reason: input.reason,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });
  } catch (error) {
    logger.warn({ err: error, reason: input.reason }, '[check-in] 风控记录写入失败');
  }
}

async function enforceRisk(userId: string, body: CheckInBody, ip?: string) {
  try {
    const configured = await checkInRiskConfig();
    const config = { ...DEFAULT_RISK_CONFIG, ...configured };
    const now = Date.now();
    const recentFrom = new Date(now - 60_000);
    if (ip) {
      const recent = await prisma.checkInRiskEvent.count({
        where: { ip, reason: 'CHECK_IN_ATTEMPT', createdAt: { gte: recentFrom } },
      });
      if (recent >= Number(config.ipRateLimitPerMin)) {
        await recordRisk({ userId, deviceId: body.deviceId, ip, reason: 'IP_RATE_LIMIT', metadata: { limit: config.ipRateLimitPerMin } });
        throw AppError.rateLimited('签到请求过于频繁，请稍后再试');
      }
    }
    if (body.deviceId) {
      const records = await prisma.checkInRecord.findMany({
        where: { userId, deviceId: { not: null } },
        select: { deviceId: true },
      });
      const devices = new Set(records.map((record) => record.deviceId).filter(Boolean));
      if (!devices.has(body.deviceId) && devices.size >= Number(config.maxDevicePerUser)) {
        await recordRisk({ userId, deviceId: body.deviceId, ip, reason: 'DEVICE_LIMIT', metadata: { limit: config.maxDevicePerUser } });
      }
      const otherAccountRecords = await prisma.checkInRecord.findMany({
        where: { deviceId: body.deviceId, userId: { not: userId } },
        select: { userId: true },
        distinct: ['userId'],
      });
      const otherAccounts = new Set(otherAccountRecords.map((record) => record.userId).filter(Boolean)).size;
      if (otherAccounts >= Number(config.suspiciousThreshold)) {
        await recordRisk({
          userId,
          deviceId: body.deviceId,
          ip,
          reason: 'DEVICE_MULTI_ACCOUNT',
          metadata: { otherAccountRecords: otherAccounts },
        });
      }
    }
    await recordRisk({ userId, deviceId: body.deviceId, ip, reason: 'CHECK_IN_ATTEMPT' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn({ err: error }, '[check-in] 风控检查失败，继续签到');
  }
}

async function grantRewards(
  db: Prisma.TransactionClient,
  userId: string,
  checkinDate: string,
  streak: number,
  configured: Record<string, unknown>,
) {
  const config = { ...DEFAULT_REWARD_CONFIG, ...configured };
  const cycleLength = Number(config.cycleLength) || CYCLE_LENGTH;
  const cycleStrategy = config.cycleStrategy === 'ONCE' ? 'ONCE' : 'LOOP';
  const rewardDay = cycleStrategy === 'ONCE'
    ? (streak <= cycleLength ? streak : 0)
    : ((streak - 1) % cycleLength) + 1;
  if (!rewardDay || !Array.isArray(config.rewards)) return [];
  const rewards = (config.rewards as Array<Record<string, unknown>>)
    .filter((reward) => Number(reward.day) === rewardDay)
    .map((reward) => ({
      day: rewardDay,
      type: String(reward.type ?? 'STAMP'),
      name: String(reward.name ?? ''),
      iconKey: String(reward.iconKey ?? ''),
    }))
    .filter((reward) => reward.name && reward.iconKey);
  const granted = [];
  for (const reward of rewards) {
    try {
      granted.push(await db.checkInRewardLog.create({
        data: { userId, checkinDate, rewardDay: reward.day, rewardType: reward.type, rewardName: reward.name, iconKey: reward.iconKey, streak },
      }));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
  return granted.map((reward) => ({ day: reward.rewardDay, type: reward.rewardType, name: reward.rewardName, iconKey: reward.iconKey }));
}

function availability(now: Date, config: typeof DEFAULT_CHECK_IN_CONFIG) {
  if (!config.enabled) {
    return { canCheckIn: false, reason: 'DISABLED' as const, notice: config.announcement || '签到活动暂未开启' };
  }

  if (config.activityStartAt && now < new Date(config.activityStartAt)) {
    return { canCheckIn: false, reason: 'DISABLED' as const, notice: config.announcement || '签到活动尚未开始' };
  }
  if (config.activityEndAt && now > new Date(config.activityEndAt)) {
    return { canCheckIn: false, reason: 'DISABLED' as const, notice: config.announcement || '签到活动已结束' };
  }

  if (config.dailyWindowEnabled) {
    const current = localClock(now);
    const start = parseTime(config.dailyWindowStart);
    const end = parseTime(config.dailyWindowEnd);
    const withinWindow = start <= end
      ? current >= start && current <= end
      : current >= start || current <= end;
    const windowLabel = `签到时间为 ${config.dailyWindowStart}–${config.dailyWindowEnd}`;
    if (!withinWindow) {
      return { canCheckIn: false, reason: 'OUT_OF_WINDOW' as const, windowLabel, notice: windowLabel };
    }
    return { canCheckIn: true, reason: null, windowLabel, notice: config.announcement || undefined };
  }

  return { canCheckIn: true, reason: null, notice: config.announcement || undefined };
}

function validateWindow(now: Date, config: typeof DEFAULT_CHECK_IN_CONFIG): void {
  const state = availability(now, config);
  if (!state.canCheckIn) {
    if (state.reason === 'OUT_OF_WINDOW') throw AppError.checkInOutOfWindow(state.notice || '当前不在签到时间');
    throw AppError.checkInDisabled(state.notice || '签到活动暂未开启');
  }
}

function rewardDtos(rewards: Array<{ rewardDay: number; rewardType: string; rewardName: string; iconKey: string }>) {
  return rewards.map((reward) => ({
    day: reward.rewardDay,
    type: reward.rewardType,
    name: reward.rewardName,
    iconKey: reward.iconKey,
  }));
}

async function readConfig() {
  const configured = await checkInConfig();
  return {
    ...DEFAULT_CHECK_IN_CONFIG,
    ...configured,
    activityStartAt: configured.activityStartAt == null ? null : String(configured.activityStartAt),
    activityEndAt: configured.activityEndAt == null ? null : String(configured.activityEndAt),
  };
}

export async function overview(userId: string) {
  const now = new Date();
  const config = await readConfig();
  const rewardConfig = { ...DEFAULT_REWARD_CONFIG, ...(await checkInRewardConfig()) };
  const cycleLength = Number(rewardConfig.cycleLength) || CYCLE_LENGTH;
  const state = availability(now, config);
  const today = localDateKey(now);
  const yesterday = shiftDateKey(today, -1);
  const month = today.slice(0, 7);
  const bounds = monthBounds(month);
  const [todayRecord, yesterdayRecord, longest, monthRecords] = await prisma.$transaction([
    prisma.checkInRecord.findUnique({ where: { userId_checkinDate: { userId, checkinDate: today } } }),
    prisma.checkInRecord.findUnique({ where: { userId_checkinDate: { userId, checkinDate: yesterday } } }),
    prisma.checkInRecord.aggregate({ where: { userId }, _max: { streak: true } }),
    prisma.checkInRecord.findMany({
      where: { userId, checkinDate: { gte: bounds.from, lte: bounds.to } },
      select: { checkinDate: true },
      orderBy: { checkinDate: 'asc' },
    }),
  ]);
  const activeRecord = todayRecord ?? yesterdayRecord;
  const currentStreak = activeRecord?.streak ?? 0;

  return {
    config,
    enabled: config.enabled,
    canCheckIn: state.canCheckIn,
    windowLabel: state.windowLabel,
    notice: state.notice,
    today,
    todayCheckedIn: Boolean(todayRecord),
    todayRecord: recordDto(todayRecord, cycleLength),
    currentStreak,
    longestStreak: longest._max.streak ?? 0,
    cycleDay: cycleDay(currentStreak, cycleLength),
    cycleLength,
    checkedDates: monthRecords.map((record) => record.checkinDate),
  };
}

export async function checkIn(userId: string, body: CheckInBody = {}, ip?: string) {
  const now = new Date();
  const config = await readConfig();
  const rewardConfig = { ...DEFAULT_REWARD_CONFIG, ...(await checkInRewardConfig()) };
  const cycleLength = Number(rewardConfig.cycleLength) || CYCLE_LENGTH;
  validateWindow(now, config);
  const today = localDateKey(now);
  const yesterday = shiftDateKey(today, -1);

  await enforceRisk(userId, body, ip);

  const existing = await prisma.checkInRecord.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } },
  });
  if (existing) {
    const rewards = await prisma.checkInRewardLog.findMany({ where: { userId, checkinDate: today } });
    throw AppError.checkInAlreadyCheckedIn('今日已签到', {
      alreadyCheckedIn: true,
      record: recordDto(existing, cycleLength),
      rewards: rewardDtos(rewards),
      overview: await overview(userId),
    });
  }

  const previous = await prisma.checkInRecord.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: yesterday } },
  });
  const streak = previous ? previous.streak + 1 : 1;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.checkInRecord.create({
        data: { userId, checkinDate: today, deviceId: body.deviceId ?? null, checkedAt: now, streak },
      });
      const rewards = await grantRewards(tx, userId, today, streak, rewardConfig);
      return { created, rewards };
    });
    return { alreadyCheckedIn: false, record: recordDto(result.created, cycleLength), rewards: result.rewards, overview: await overview(userId) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await prisma.checkInRecord.findUnique({
      where: { userId_checkinDate: { userId, checkinDate: today } },
    });
    if (!concurrent) throw error;
    const rewards = await prisma.checkInRewardLog.findMany({ where: { userId, checkinDate: today } });
    throw AppError.checkInAlreadyCheckedIn('今日已签到', {
      alreadyCheckedIn: true,
      record: recordDto(concurrent, cycleLength),
      rewards: rewardDtos(rewards),
      overview: await overview(userId),
    });
  }
}

export async function history(userId: string, query: HistoryQuery) {
  const rewardConfig = { ...DEFAULT_REWARD_CONFIG, ...(await checkInRewardConfig()) };
  const cycleLength = Number(rewardConfig.cycleLength) || CYCLE_LENGTH;
  const bounds = query.month ? monthBounds(query.month) : undefined;
  const where = {
    userId,
    ...(bounds ? { checkinDate: { gte: bounds.from, lte: bounds.to } } : {}),
  };
  const [records, total] = await prisma.$transaction([
    prisma.checkInRecord.findMany({
      where,
      orderBy: [{ checkinDate: 'desc' }, { checkedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.checkInRecord.count({ where }),
  ]);
  return {
    list: records.map((record) => recordDto(record, cycleLength)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function riskEvents(query: RiskEventQuery) {
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = query.to ? new Date(query.to) : undefined;
  const where = {
    ...(query.reason ? { reason: query.reason } : {}),
    createdAt: { gte: from, ...(to ? { lte: to } : {}) },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.checkInRiskEvent.findMany({
      where,
      include: { user: { select: { username: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.checkInRiskEvent.count({ where }),
  ]);
  return {
    list: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.user?.username ?? null,
      displayName: row.user?.displayName ?? null,
      deviceId: row.deviceId,
      ip: row.ip,
      reason: row.reason,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.createdAt,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

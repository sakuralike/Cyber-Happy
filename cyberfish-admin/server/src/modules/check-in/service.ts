import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import type { HistoryQuery } from './schema';

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

function cycleDay(streak: number): number {
  return streak > 0 ? ((streak - 1) % CYCLE_LENGTH) + 1 : 0;
}

function recordDto(record: CheckInRecord | null) {
  if (!record) return null;
  return {
    id: record.id,
    date: record.checkinDate,
    checkedAt: record.checkedAt,
    occurredAt: record.checkedAt,
    streak: record.streak,
    cycleDay: cycleDay(record.streak),
  };
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function availability(now: Date, config: typeof DEFAULT_CHECK_IN_CONFIG) {
  if (!config.enabled) {
    return { canCheckIn: false, notice: config.announcement || '签到活动暂未开启' };
  }

  if (config.activityStartAt && now < new Date(config.activityStartAt)) {
    return { canCheckIn: false, notice: config.announcement || '签到活动尚未开始' };
  }
  if (config.activityEndAt && now > new Date(config.activityEndAt)) {
    return { canCheckIn: false, notice: config.announcement || '签到活动已结束' };
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
      return { canCheckIn: false, windowLabel, notice: windowLabel };
    }
    return { canCheckIn: true, windowLabel, notice: config.announcement || undefined };
  }

  return { canCheckIn: true, notice: config.announcement || undefined };
}

function validateWindow(now: Date, config: typeof DEFAULT_CHECK_IN_CONFIG): void {
  const state = availability(now, config);
  if (!state.canCheckIn) {
    throw AppError.invalidState(state.notice || '当前不在签到时间');
  }
}

function readConfig() {
  return DEFAULT_CHECK_IN_CONFIG;
}

export async function overview(userId: string) {
  const now = new Date();
  const config = readConfig();
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
    todayRecord: recordDto(todayRecord),
    currentStreak,
    longestStreak: longest._max.streak ?? 0,
    cycleDay: cycleDay(currentStreak),
    cycleLength: CYCLE_LENGTH,
    checkedDates: monthRecords.map((record) => record.checkinDate),
  };
}

export async function checkIn(userId: string) {
  const now = new Date();
  const config = readConfig();
  validateWindow(now, config);
  const today = localDateKey(now);
  const yesterday = shiftDateKey(today, -1);

  const existing = await prisma.checkInRecord.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } },
  });
  if (existing) {
    return { alreadyCheckedIn: true, record: recordDto(existing), overview: await overview(userId) };
  }

  const previous = await prisma.checkInRecord.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: yesterday } },
  });
  const streak = previous ? previous.streak + 1 : 1;

  try {
    const created = await prisma.checkInRecord.create({
      data: { userId, checkinDate: today, checkedAt: now, streak },
    });
    return { alreadyCheckedIn: false, record: recordDto(created), overview: await overview(userId) };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await prisma.checkInRecord.findUnique({
      where: { userId_checkinDate: { userId, checkinDate: today } },
    });
    if (!concurrent) throw error;
    return { alreadyCheckedIn: true, record: recordDto(concurrent), overview: await overview(userId) };
  }
}

export async function history(userId: string, query: HistoryQuery) {
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
    list: records.map((record) => recordDto(record)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

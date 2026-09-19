import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const serverDir = process.cwd();
const testDir = mkdtempSync(join(serverDir, 'prisma', 'cyberfish-check-in-'));
const testDatabase = join(testDir, 'check-in.db');
writeFileSync(testDatabase, '');
const databasePath = `./${relative(join(serverDir, 'prisma'), testDatabase).replaceAll('\\', '/')}`;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${databasePath}`;

let prisma: any;
let service: typeof import('../src/modules/check-in/service');
let errors: typeof import('../src/lib/errors');
let ConfigScope: typeof import('../src/lib/enums').ConfigScope;
const users: string[] = [];

const snapshot = {
  SITE: {},
  USER_PAGE: {},
  CHECKIN_BASIC: {
    enabled: true,
    activityTitle: '每日签到',
    timezone: 'Asia/Shanghai',
    dailyWindowEnabled: false,
    dailyWindowStart: '00:00',
    dailyWindowEnd: '23:59',
    activityStartAt: null,
    activityEndAt: null,
    announcement: '',
  },
  CHECKIN_REWARD: {
    rewardMode: 'BADGE',
    cycleLength: 7,
    cycleStrategy: 'LOOP',
    rewards: [
      { day: 1, type: 'STAMP', name: '初竿', iconKey: 'stamp_rod', milestone: false },
    ],
  },
  CHECKIN_RISK: {
    maxDevicePerUser: 2,
    ipRateLimitPerMin: 2,
    suspiciousThreshold: 2,
    auditReplayEnabled: true,
    backfillEnabled: false,
  },
  DOWNLOAD: [],
  BANNER: [],
  LANDING: [],
};

async function createUser(label: string): Promise<string> {
  const user = await prisma.userAccount.create({
    data: { username: `${label}-${randomUUID()}`, passwordHash: 'test', displayName: label },
    select: { id: true },
  });
  users.push(user.id);
  return user.id;
}

before(async () => {
  const prismaCli = join(serverDir, '..', 'node_modules/prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../src/lib/prisma'));
  service = await import('../src/modules/check-in/service');
  errors = await import('../src/lib/errors');
  ({ ConfigScope } = await import('../src/lib/enums'));

  await prisma.checkInRewardLog.deleteMany();
  await prisma.checkInRiskEvent.deleteMany();
  await prisma.checkInRecord.deleteMany();
  await prisma.siteSetting.deleteMany({ where: { scope: { in: ['CHECKIN_BASIC', 'CHECKIN_REWARD', 'CHECKIN_RISK'] } } });
  await prisma.configRevision.deleteMany();

  await prisma.configRevision.create({
    data: {
      version: 1,
      scopes: 'SITE,USER_PAGE,CHECKIN_BASIC,CHECKIN_REWARD,CHECKIN_RISK,DOWNLOAD,BANNER,LANDING',
      snapshotJson: JSON.stringify(snapshot),
      changesJson: '[]',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

describe('check-in service', () => {
  it('grants a reward once and reports a duplicate with the dedicated error code', async () => {
    const userId = await createUser('reward');

    const first = await service.checkIn(userId, { deviceId: 'reward-device' });
    assert.equal(first.alreadyCheckedIn, false);
    assert.equal(first.rewards.length, 1);
    assert.equal(await prisma.checkInRewardLog.count({ where: { userId } }), 1);

    await assert.rejects(
      service.checkIn(userId),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.CHECKIN_ALREADY_CHECKED_IN,
    );
    assert.equal(await prisma.checkInRewardLog.count({ where: { userId } }), 1);
  });

  it('rate-limits repeated attempts from one IP', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    await service.checkIn(await createUser('ip-one'), {}, ip);
    await service.checkIn(await createUser('ip-two'), {}, ip);

    await assert.rejects(
      service.checkIn(await createUser('ip-three'), {}, ip),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.RATE_LIMITED,
    );
    assert.equal(await prisma.checkInRiskEvent.count({ where: { ip, reason: 'IP_RATE_LIMIT' } }), 1);
  });

  it('records a device limit event without blocking the check-in', async () => {
    const userId = await createUser('device-limit');
    await prisma.checkInRecord.createMany({
      data: [
        { userId, checkinDate: '2026-09-17', deviceId: 'old-device-1', streak: 1 },
        { userId, checkinDate: '2026-09-18', deviceId: 'old-device-2', streak: 2 },
      ],
    });

    const result = await service.checkIn(userId, { deviceId: 'new-device' });
    assert.equal(result.alreadyCheckedIn, false);
    assert.equal(
      await prisma.checkInRiskEvent.count({ where: { userId, reason: 'DEVICE_LIMIT' } }),
      1,
    );
  });

  it('rejects invalid cross-field check-in settings', async () => {
    await assert.rejects(
      import('../src/modules/system-settings/service').then(({ saveSettings }) => saveSettings(
        ConfigScope.CHECKIN_BASIC,
        {
          items: [
            { key: 'dailyWindowEnabled', value: true },
            { key: 'dailyWindowStart', value: '23:00' },
            { key: 'dailyWindowEnd', value: '01:00' },
          ],
        },
      )),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.VALIDATION
        && error.message.includes('每日结束时间必须晚于开始时间'),
    );

    await assert.rejects(
      import('../src/modules/system-settings/service').then(({ saveSettings }) => saveSettings(
        ConfigScope.CHECKIN_REWARD,
        {
          items: [{
            key: 'rewards',
            value: [{ day: 29, type: 'STAMP', name: '超限', iconKey: 'stamp_rod', milestone: false }],
          }],
        },
      )),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.VALIDATION
        && error.message.includes('奖励天数不能超过周期上限'),
    );
  });

  it('allows only one successful check-in under concurrent requests', async () => {
    const userId = await createUser('concurrent');
    const results = await Promise.allSettled([
      service.checkIn(userId),
      service.checkIn(userId),
    ]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof errors.AppError);
    assert.equal(rejected[0]!.reason.code, errors.ErrorCode.CHECKIN_ALREADY_CHECKED_IN);
    assert.equal(await prisma.checkInRecord.count({ where: { userId } }), 1);
  });

  it('returns daily operations stats for attempts, success, users, and risks', async () => {
    const userId = await createUser('stats');
    await prisma.checkInRecord.createMany({
      data: [
        { userId, checkinDate: '2099-01-01', streak: 1 },
        { userId, checkinDate: '2099-01-02', streak: 2 },
      ],
    });
    await prisma.checkInRiskEvent.createMany({
      data: [
        { userId, reason: 'CHECK_IN_ATTEMPT', createdAt: new Date('2099-01-01T04:00:00.000Z') },
        { userId, reason: 'DEVICE_LIMIT', createdAt: new Date('2099-01-02T04:00:00.000Z') },
      ],
    });

    const result = await service.stats({ from: '2099-01-01', to: '2099-01-03' });
    assert.equal(result.daily.length, 3);
    assert.deepEqual(result.daily[0], { date: '2099-01-01', attempts: 1, success: 1, uniqueUsers: 1, riskEvents: 1 });
    assert.deepEqual(result.daily[1], { date: '2099-01-02', attempts: 0, success: 1, uniqueUsers: 1, riskEvents: 1 });
    assert.deepEqual(result.totals, { attempts: 1, success: 2, uniqueUsers: 1, riskEvents: 2 });
  });

  it('does not count the legacy device sentinel toward the device limit', async () => {
    const userId = await createUser('legacy-device');
    await prisma.checkInRecord.create({
      data: {
        userId,
        checkinDate: '2099-02-01',
        deviceId: service.LEGACY_CHECK_IN_DEVICE_ID,
        streak: 1,
      },
    });

    await service.checkIn(userId, { deviceId: 'new-device' });
    assert.equal(await prisma.checkInRiskEvent.count({ where: { userId, reason: 'DEVICE_LIMIT' } }), 0);
  });
});

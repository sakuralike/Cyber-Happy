import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkInBodySchema } from '../src/modules/check-in/schema';
import { permissionsOf } from '../src/plugins/auth';
import { appEventSchema } from '../src/modules/app-event/schema';

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
let app: Awaited<ReturnType<typeof import('../src/app').buildApp>>;
let appApiToken: string;
const users: string[] = [];

const snapshot = {
  SITE: {},
  USER_PAGE: {},
  CHECKIN_BASIC: {
    enabled: true,
    activityTitle: '每日签到',
    timezone: 'Asia/Shanghai',
    dailyWindowEnabled: false,
    dailyWindowStart: '06:00',
    dailyWindowEnd: '23:00',
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
      { day: 3, type: 'STAMP', name: '常客', iconKey: 'stamp_regular', milestone: false },
      { day: 7, type: 'MEDAL', name: '铜钩钓士', iconKey: 'medal_bronze', milestone: true },
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

function shanghaiDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function replacePublishedScope(scope: string, value: Record<string, unknown>) {
  const revision = await prisma.configRevision.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  assert.ok(revision);
  const current = JSON.parse(revision.snapshotJson) as Record<string, unknown>;
  await prisma.configRevision.update({
    where: { id: revision.id },
    data: { snapshotJson: JSON.stringify({ ...current, [scope]: value }) },
  });
  return async () => {
    await prisma.configRevision.update({
      where: { id: revision.id },
      data: { snapshotJson: revision.snapshotJson },
    });
  };
}

async function waitForRiskEvent(where: Record<string, unknown>) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const event = await prisma.checkInRiskEvent.findFirst({ where });
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
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
  ({ appApiToken } = (await import('../src/config')).config);
  app = await import('../src/app').then(({ buildApp }) => buildApp());
});

after(async () => {
  await app?.close();
  await prisma?.$disconnect();
  rmSync(testDir, { recursive: true, force: true });
});

  describe('check-in service', { concurrency: false }, () => {
  it('uses the planned default daily check-in window', async () => {
    const settings = await import('../src/modules/system-settings/service');
    assert.equal(service.DEFAULT_CHECK_IN_CONFIG.enabled, false);
    assert.equal(settings.CHECKIN_BASIC_DEFAULTS.enabled, false);
    assert.equal(service.DEFAULT_CHECK_IN_CONFIG.dailyWindowStart, '06:00');
    assert.equal(service.DEFAULT_CHECK_IN_CONFIG.dailyWindowEnd, '23:00');
    assert.equal(settings.CHECKIN_BASIC_DEFAULTS.dailyWindowStart, '06:00');
    assert.equal(settings.CHECKIN_BASIC_DEFAULTS.dailyWindowEnd, '23:00');
  });

  it('accepts every planned check-in analytics event type', () => {
    const eventTypes = [
      'CHECKIN_ENTRY_EXPOSE',
      'CHECKIN_PAGE_VIEW',
      'CHECKIN_SUCCESS',
      'CHECKIN_FAIL',
      'MILESTONE_POPUP_VIEW',
    ];
    for (const eventType of eventTypes) {
      assert.equal(appEventSchema.safeParse({ deviceId: 'device-1', eventType }).success, true);
    }
  });

  it('matches the planned operator and viewer permission matrix', () => {
    assert.equal(permissionsOf('OPERATOR').includes('siteConfig:publish'), true);
    assert.equal(permissionsOf('OPERATOR').includes('checkInRisk:read'), true);
    assert.equal(permissionsOf('VIEWER').includes('checkInRisk:read'), false);
  });

  it('requires a stable device id for every new check-in request', () => {
    assert.equal(checkInBodySchema.safeParse({}).success, false);
    assert.equal(checkInBodySchema.safeParse({ deviceId: 'device-1' }).success, true);
    assert.equal(checkInBodySchema.safeParse({ deviceId: service.LEGACY_CHECK_IN_DEVICE_ID }).success, false);
    assert.deepEqual(
      (service.DEFAULT_CHECK_IN_CONFIG as unknown as { activityTitle: string }).activityTitle,
      '每日签到',
    );
  });

  it('defaults all planned reward milestones and audits service failures', async () => {
    const settings = await import('../src/modules/system-settings/service');
    const rewards = settings.CHECKIN_REWARD_DEFAULTS.rewards as Array<{ day: number }>;
    assert.deepEqual(rewards.map((reward) => reward.day), [1, 3, 7, 14, 21, 28]);

    const userId = await createUser('internal-audit');
    await service.recordCheckInHttpFailure(
      { userId, deviceId: 'internal-audit-device', ip: '203.0.113.30', userAgent: 'Audit/1.0', requestId: 'internal-request' },
      new Error('unexpected'),
    );
    const event = await prisma.checkInRiskEvent.findFirst({ where: { userId, reason: 'CHECK_IN_FAILED' } });
    assert.ok(event);
    assert.deepEqual(JSON.parse(event.metadata), {
      errorCode: errors.ErrorCode.INTERNAL,
      userAgent: 'Audit/1.0',
      requestId: 'internal-request',
    });
  });

  it('grants a reward once and reports a duplicate with the dedicated error code', async () => {
    const userId = await createUser('reward');

    const first = await service.checkIn(userId, { deviceId: 'reward-device' });
    assert.equal(first.alreadyCheckedIn, false);
    assert.equal(first.rewards.length, 1);
    assert.equal(await prisma.checkInRewardLog.count({ where: { userId } }), 1);

    await assert.rejects(
      service.checkIn(userId, { deviceId: 'reward-device' }),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.CHECKIN_ALREADY_CHECKED_IN,
    );
    assert.equal(await prisma.checkInRewardLog.count({ where: { userId } }), 1);
  });

  it('grants a configured day fourteen milestone on the fourteenth consecutive check-in', async () => {
    const userId = await createUser('day-fourteen');
    const today = shanghaiDateKey();
    await prisma.checkInRecord.create({
      data: {
        userId,
        checkinDate: previousDateKey(today),
        deviceId: 'day-fourteen-previous',
        streak: 13,
      },
    });
    const restore = await replacePublishedScope('CHECKIN_REWARD', {
      rewardMode: 'BADGE',
      cycleLength: 7,
      cycleStrategy: 'LOOP',
      rewards: [
        { day: 14, type: 'MEDAL', name: '银钩钓士', iconKey: 'medal_silver', milestone: true },
      ],
    });

    try {
      const result = await service.checkIn(userId, { deviceId: 'day-fourteen-current' });
      assert.deepEqual(result.rewards, [
        { day: 14, type: 'MEDAL', name: '银钩钓士', iconKey: 'medal_silver', milestone: true },
      ]);
    } finally {
      await restore();
    }
  });

  it('keeps the streak across a year boundary using the server clock', async () => {
    const userId = await createUser('year-boundary');
    await prisma.checkInRecord.create({
      data: {
        userId,
        checkinDate: '2025-12-31',
        deviceId: 'year-boundary-device',
        streak: 9,
      },
    });

    const result = await service.checkIn(
      userId,
      { deviceId: 'year-boundary-device' },
      { now: new Date('2026-01-01T04:00:00.000Z') },
    );

    assert.equal(result.record?.date, '2026-01-01');
    assert.equal(result.record?.streak, 10);
  });

  it('returns earned milestone rewards as persistent honors in the overview', async () => {
    const userId = await createUser('earned-honors');
    await prisma.checkInRewardLog.createMany({
      data: [
        { userId, checkinDate: '2026-09-07', rewardDay: 7, rewardType: 'MEDAL', rewardName: '铜钩钓士', iconKey: 'medal_bronze', milestone: true, streak: 7 },
        { userId, checkinDate: '2026-09-14', rewardDay: 14, rewardType: 'MEDAL', rewardName: '银钩钓士', iconKey: 'medal_silver', milestone: true, streak: 14 },
        { userId, checkinDate: '2026-09-21', rewardDay: 14, rewardType: 'MEDAL', rewardName: '银钩钓士', iconKey: 'medal_silver', milestone: true, streak: 21 },
      ],
    });

    const result = await service.overview(userId);

    assert.deepEqual(result.earnedRewards, [
      { day: 7, type: 'MEDAL', name: '铜钩钓士', iconKey: 'medal_bronze', milestone: true },
      { day: 14, type: 'MEDAL', name: '银钩钓士', iconKey: 'medal_silver', milestone: true },
    ]);
  });

  it('rate-limits repeated attempts from one IP', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    await service.checkIn(await createUser('ip-one'), { deviceId: 'ip-device-one' }, { ip });
    await service.checkIn(await createUser('ip-two'), { deviceId: 'ip-device-two' }, { ip });

    await assert.rejects(
      service.checkIn(
        await createUser('ip-three'),
        { deviceId: 'ip-device-three' },
        { ip, userAgent: 'CyberFish-Rate-Test/1.0', requestId: 'request-rate-limit' },
      ),
      (error: unknown) => error instanceof errors.AppError
        && error.code === errors.ErrorCode.RATE_LIMITED,
    );
    const event = await prisma.checkInRiskEvent.findFirst({ where: { ip, reason: 'IP_RATE_LIMIT' } });
    assert.ok(event);
    assert.deepEqual(JSON.parse(event.metadata), {
      limit: 2,
      errorCode: errors.ErrorCode.RATE_LIMITED,
      userAgent: 'CyberFish-Rate-Test/1.0',
      requestId: 'request-rate-limit',
    });
  });

  it('enforces the per-IP limit under concurrent requests', async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const userIds = await Promise.all([
      createUser('concurrent-ip-one'),
      createUser('concurrent-ip-two'),
      createUser('concurrent-ip-three'),
    ]);

    const results = await Promise.allSettled(userIds.map((userId, index) =>
      service.checkIn(userId, { deviceId: `concurrent-ip-device-${index}` }, ip),
    ));

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]!.reason instanceof errors.AppError);
    assert.equal(rejected[0]!.reason.code, errors.ErrorCode.RATE_LIMITED);
  });

  it('records disabled check-in failures with request context when replay audit is enabled', async () => {
    const userId = await createUser('disabled-audit');
    const attemptsBefore = await prisma.checkInRiskEvent.count({
      where: { userId, reason: 'CHECK_IN_ATTEMPT' },
    });
    const restore = await replacePublishedScope('CHECKIN_BASIC', {
      enabled: false,
      activityTitle: '每日签到',
      timezone: 'Asia/Shanghai',
      dailyWindowEnabled: false,
      dailyWindowStart: '06:00',
      dailyWindowEnd: '23:00',
      activityStartAt: null,
      activityEndAt: null,
      announcement: '签到暂停维护',
    });

    try {
      await assert.rejects(
        service.checkIn(
          userId,
          { deviceId: 'disabled-audit-device' },
          {
            ip: '203.0.113.20',
            userAgent: 'CyberFish-Audit-Test/1.0',
            requestId: 'request-disabled-audit',
          },
        ),
        (error: unknown) => error instanceof errors.AppError
          && error.code === errors.ErrorCode.CHECKIN_DISABLED,
      );
      const event = await prisma.checkInRiskEvent.findFirst({
        where: { userId, reason: 'CHECKIN_DISABLED' },
      });
      assert.ok(event);
      assert.equal(event.deviceId, 'disabled-audit-device');
      assert.equal(event.ip, '203.0.113.20');
      assert.deepEqual(JSON.parse(event.metadata), {
        errorCode: errors.ErrorCode.CHECKIN_DISABLED,
        userAgent: 'CyberFish-Audit-Test/1.0',
        requestId: 'request-disabled-audit',
      });
      assert.equal(
        await prisma.checkInRiskEvent.count({ where: { userId, reason: 'CHECK_IN_ATTEMPT' } }),
        attemptsBefore + 1,
      );
    } finally {
      await restore();
    }
  });

  it('returns the dedicated out-of-window error and audit event', async () => {
    const userId = await createUser('window-audit');
    const restore = await replacePublishedScope('CHECKIN_BASIC', {
      enabled: true,
      activityTitle: '每日签到',
      timezone: 'Asia/Shanghai',
      dailyWindowEnabled: true,
      dailyWindowStart: '06:00',
      dailyWindowEnd: '07:00',
      activityStartAt: null,
      activityEndAt: null,
      announcement: '',
    });

    try {
      await assert.rejects(
        service.checkIn(
          userId,
          { deviceId: 'window-audit-device' },
          {
            ip: '203.0.113.21',
            userAgent: 'CyberFish-Window-Test/1.0',
            requestId: 'request-window-audit',
            now: new Date('2026-09-20T04:00:00.000Z'),
          },
        ),
        (error: unknown) => error instanceof errors.AppError
          && error.code === errors.ErrorCode.CHECKIN_OUT_OF_WINDOW,
      );
      const event = await prisma.checkInRiskEvent.findFirst({
        where: { userId, reason: 'OUT_OF_WINDOW' },
      });
      assert.ok(event);
      assert.equal(JSON.parse(event.metadata).errorCode, errors.ErrorCode.CHECKIN_OUT_OF_WINDOW);
    } finally {
      await restore();
    }
  });

  it('keeps only the minimal rate-limit attempt when replay audit is disabled', async () => {
    const userId = await createUser('audit-disabled');
    const restoreBasic = await replacePublishedScope('CHECKIN_BASIC', {
      enabled: false,
      activityTitle: '每日签到',
      timezone: 'Asia/Shanghai',
      dailyWindowEnabled: false,
      dailyWindowStart: '06:00',
      dailyWindowEnd: '23:00',
      activityStartAt: null,
      activityEndAt: null,
      announcement: '',
    });
    const restoreRisk = await replacePublishedScope('CHECKIN_RISK', {
      maxDevicePerUser: 2,
      ipRateLimitPerMin: 2,
      suspiciousThreshold: 2,
      auditReplayEnabled: false,
      backfillEnabled: false,
    });

    try {
      await assert.rejects(
        service.checkIn(userId, { deviceId: 'audit-disabled-device' }),
        (error: unknown) => error instanceof errors.AppError
          && error.code === errors.ErrorCode.CHECKIN_DISABLED,
      );
      assert.equal(await prisma.checkInRiskEvent.count({ where: { userId, reason: 'CHECKIN_DISABLED' } }), 0);
      const attempt = await prisma.checkInRiskEvent.findFirst({ where: { userId, reason: 'CHECK_IN_ATTEMPT' } });
      assert.ok(attempt);
      assert.deepEqual(JSON.parse(attempt.metadata), {});
    } finally {
      await restoreRisk();
      await restoreBasic();
    }
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
    assert.ok(await waitForRiskEvent({ userId, reason: 'DEVICE_LIMIT' }));
  });

  it('records a multi-account event when the configured account threshold is reached', async () => {
    const deviceId = `shared-device-${randomUUID()}`;
    const firstUserId = await createUser('shared-device-first');
    const secondUserId = await createUser('shared-device-second');
    await prisma.checkInRecord.create({
      data: {
        userId: firstUserId,
        checkinDate: '2026-09-18',
        deviceId,
        streak: 1,
      },
    });

    const result = await service.checkIn(secondUserId, { deviceId });

    assert.equal(result.alreadyCheckedIn, false);
    const event = await waitForRiskEvent({ userId: secondUserId, deviceId, reason: 'DEVICE_MULTI_ACCOUNT' });
    assert.ok(event);
    assert.equal(JSON.parse(event.metadata).accountCount, 2);
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
      service.checkIn(userId, { deviceId: 'concurrent-device' }),
      service.checkIn(userId, { deviceId: 'concurrent-device' }),
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
        { userId, checkinDate: '2099-01-01', deviceId: 'stats-device', streak: 1 },
        { userId, checkinDate: '2099-01-02', deviceId: 'stats-device', streak: 2 },
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
    assert.deepEqual(result.daily[0], { date: '2099-01-01', attempts: 1, success: 1, uniqueUsers: 1, riskEvents: 0 });
    assert.deepEqual(result.daily[1], { date: '2099-01-02', attempts: 0, success: 1, uniqueUsers: 1, riskEvents: 1 });
    assert.deepEqual(result.totals, { attempts: 1, success: 2, uniqueUsers: 1, riskEvents: 1 });

    const defaultRiskEvents = await service.riskEvents({ page: 1, pageSize: 20 });
    assert.equal(defaultRiskEvents.list.some((event) => event.reason === 'CHECK_IN_ATTEMPT'), false);
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

  it('rejects a check-in without device id at the HTTP boundary', async () => {
    const userId = await createUser('route-device-required');
    const token = app.jwt.sign({ sub: userId, kind: 'APP_USER' }, { expiresIn: '5m' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in',
      headers: {
        authorization: `Bearer ${token}`,
        'x-app-token': appApiToken,
      },
      payload: {},
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().code, errors.ErrorCode.VALIDATION);
    const event = await prisma.checkInRiskEvent.findFirst({ where: { userId, reason: 'INVALID_REQUEST' } });
    assert.ok(event);
    assert.equal(JSON.parse(event.metadata).errorCode, errors.ErrorCode.VALIDATION);
  });

  it('audits unauthenticated and sentinel check-in POST failures once', async () => {
    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in',
      headers: { 'user-agent': 'Audit-Unauth/1.0' },
      payload: { deviceId: 'unauthenticated-device' },
    });
    assert.equal(unauthenticated.statusCode, 401);
    const unauthorizedEvents = await prisma.checkInRiskEvent.findMany({ where: { reason: 'UNAUTHORIZED', deviceId: 'unauthenticated-device' } });
    assert.equal(unauthorizedEvents.length, 1);
    assert.equal(JSON.parse(unauthorizedEvents[0]!.metadata).errorCode, errors.ErrorCode.UNAUTHORIZED);

    const userId = await createUser('legacy-rejected');
    const token = app.jwt.sign({ sub: userId, kind: 'APP_USER' }, { expiresIn: '5m' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in',
      headers: { authorization: `Bearer ${token}`, 'x-app-token': appApiToken, 'user-agent': 'Audit-Sentinel/1.0' },
      payload: { deviceId: service.LEGACY_CHECK_IN_DEVICE_ID },
    });
    assert.equal(response.statusCode, 422);
    assert.equal(await prisma.checkInRecord.count({ where: { userId } }), 0);
    const sentinelEvents = await prisma.checkInRiskEvent.findMany({ where: { userId, reason: 'INVALID_REQUEST' } });
    assert.equal(sentinelEvents.length, 1);
    assert.equal(JSON.parse(sentinelEvents[0]!.metadata).errorCode, errors.ErrorCode.VALIDATION);
  });

  it('applies the reward-default migration only to the legacy default', async () => {
    const oldRewards = JSON.stringify([
      { day: 1, type: 'STAMP', name: '初竿', iconKey: 'stamp_rod', milestone: false },
      { day: 3, type: 'STAMP', name: '常客', iconKey: 'stamp_regular', milestone: false },
      { day: 7, type: 'MEDAL', name: '铜钩钓士', iconKey: 'medal_bronze', milestone: true },
    ]);
    await prisma.siteSetting.upsert({
      where: { scope_key: { scope: 'CHECKIN_REWARD', key: 'rewards' } },
      create: { id: 'migration-test-rewards', scope: 'CHECKIN_REWARD', key: 'rewards', value: oldRewards },
      update: { value: oldRewards, draftValue: null },
    });
    const migration = readFileSync(join(serverDir, 'prisma', 'migrations', '20260920_check_in_reward_defaults', 'migration.sql'), 'utf8');
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean))
      await prisma.$executeRawUnsafe(statement);
    const upgraded = await prisma.siteSetting.findUnique({ where: { scope_key: { scope: 'CHECKIN_REWARD', key: 'rewards' } } });
    assert.ok(upgraded);
    assert.deepEqual(JSON.parse(upgraded.value).map((reward: { day: number }) => reward.day), [1, 3, 7, 14, 21, 28]);
    const published = await prisma.configRevision.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    assert.ok(published);
    const publishedSnapshot = JSON.parse(published.snapshotJson) as { CHECKIN_REWARD: { rewards: Array<{ day: number }> } };
    assert.deepEqual(publishedSnapshot.CHECKIN_REWARD.rewards.map((reward) => reward.day), [1, 3, 7, 14, 21, 28]);
  });

  it('preserves a draft edited after scheduling and cancels pending revisions on rollback', async () => {
    const settings = await import('../src/modules/system-settings/service');
    await settings.saveSettings(ConfigScope.CHECKIN_BASIC, { items: [{ key: 'activityTitle', value: '排期版本' }] });
    const scheduled = await settings.publish({
      scopes: [ConfigScope.CHECKIN_BASIC],
      effectiveAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await settings.saveSettings(ConfigScope.CHECKIN_BASIC, { items: [{ key: 'activityTitle', value: '排期后草稿' }] });
    await prisma.configRevision.update({ where: { id: scheduled.id }, data: { effectiveAt: new Date(Date.now() - 1_000) } });
    assert.equal(await settings.publishScheduled(), 1);
    const setting = await prisma.siteSetting.findUnique({ where: { scope_key: { scope: 'CHECKIN_BASIC', key: 'activityTitle' } } });
    assert.equal(setting?.value, JSON.stringify('排期版本'));
    assert.equal(setting?.draftValue, JSON.stringify('排期后草稿'));

    const latest = await prisma.configRevision.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    assert.ok(latest);
    const nextVersion = (await prisma.configRevision.findFirst({ orderBy: { version: 'desc' } }))!.version + 1;
    const snapshotJson = latest.snapshotJson;
    await prisma.configRevision.createMany({
      data: [
        { version: nextVersion, scopes: 'CHECKIN_BASIC', snapshotJson, status: 'PENDING', effectiveAt: new Date(Date.now() + 60_000) },
        { version: nextVersion + 1, scopes: 'SITE', snapshotJson, status: 'PENDING', effectiveAt: new Date(Date.now() + 120_000) },
      ],
    });
    await settings.rollback(latest.id);
    assert.equal(await prisma.configRevision.count({ where: { status: 'PENDING' } }), 0);
    assert.equal(await settings.publishScheduled(), 0);
  });

  it('keeps public snapshots aligned with setting rows across scheduled and immediate scopes', async () => {
    const settings = await import('../src/modules/system-settings/service');
    await settings.saveSettings(ConfigScope.CHECKIN_BASIC, { items: [{ key: 'activityTitle', value: '排期一致性' }] });
    const scheduled = await settings.publish({
      scopes: [ConfigScope.CHECKIN_BASIC],
      effectiveAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await settings.saveSettings(ConfigScope.SITE, { items: [{ key: 'site.name', value: '立即一致性' }] });
    const immediate = await settings.publish({ scopes: [ConfigScope.SITE] });
    assert.ok(immediate.version > scheduled.version);
    await prisma.configRevision.update({ where: { id: scheduled.id }, data: { effectiveAt: new Date(Date.now() - 1_000) } });
    assert.equal(await settings.publishScheduled(), 1);

    const basicPublic = await settings.publicConfig(ConfigScope.CHECKIN_BASIC);
    const sitePublic = await settings.publicConfig(ConfigScope.SITE);
    const basicRow = await prisma.siteSetting.findUnique({ where: { scope_key: { scope: 'CHECKIN_BASIC', key: 'activityTitle' } } });
    const siteRow = await prisma.siteSetting.findUnique({ where: { scope_key: { scope: 'SITE', key: 'site.name' } } });
    assert.equal((basicPublic as { data: Record<string, unknown> }).data.activityTitle, JSON.parse(basicRow!.value));
    assert.equal((sitePublic as { data: Record<string, unknown> }).data['site.name'], JSON.parse(siteRow!.value));
  });

  it('enforces risk visibility and lets an operator publish audited check-in settings', async () => {
    const viewer = await prisma.adminUser.create({
      data: {
        username: `viewer-${randomUUID()}`,
        passwordHash: 'test',
        displayName: '只读检查员',
        role: 'VIEWER',
      },
    });
    const operator = await prisma.adminUser.create({
      data: {
        username: `operator-${randomUUID()}`,
        passwordHash: 'test',
        displayName: '签到运营员',
        role: 'OPERATOR',
      },
    });
    const viewerToken = app.jwt.sign({ sub: viewer.id }, { expiresIn: '5m' });
    const operatorToken = app.jwt.sign({ sub: operator.id }, { expiresIn: '5m' });

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/check-in/risk-events?page=1&pageSize=20',
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    assert.equal(forbidden.statusCode, 403);

    const readable = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/check-in/risk-events?page=1&pageSize=20',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    assert.equal(readable.statusCode, 200);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/CHECKIN_BASIC/items',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { items: [{ key: 'activityTitle', value: '闭环测试签到' }] },
    });
    assert.equal(saved.statusCode, 200);

    const published = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/settings/publish',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { scopes: ['CHECKIN_BASIC'], note: '签到闭环权限与审计测试' },
    });
    assert.equal(published.statusCode, 201);

    const audit = await prisma.auditLog.findFirst({
      where: { operatorId: operator.id, module: 'CHECKIN_SETTINGS', action: 'PUBLISH' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(audit?.before);
    assert.ok(audit?.after);
  });
});

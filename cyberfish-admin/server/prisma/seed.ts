/**
 * 赛博鱼乐管理后台 · 演示数据种子
 * ------------------------------------------------------------
 * 运行：npm run db:seed  （等价 tsx prisma/seed.ts）
 * 说明：会先清空全部业务表，再写入一套自洽的演示数据，
 *       便于前端登录后立即看到看板 / 版本 / 模型 / 误报 / 日志的完整效果。
 *
 * 默认账号：
 *   admin / admin123        管理员
 *   operator / operator123  运营
 *   reviewer / reviewer123  复核员
 *   viewer / viewer123      只读
 */
import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/hash';

// 保证 .env 先被加载（logger -> config 的副作用），DATABASE_URL 就绪
import '../src/config';

const CUID = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

async function wipe(): Promise<void> {
  // 按外键依赖逆序清空
  await prisma.auditLog.deleteMany();
  await prisma.misreportStatusLog.deleteMany();
  await prisma.misreport.deleteMany();
  await prisma.deviceDispatchLog.deleteMany();
  await prisma.modelDispatch.deleteMany();
  await prisma.mlModel.deleteMany();
  await prisma.appVersion.deleteMany();
  await prisma.appEvent.deleteMany();
  await prisma.dailyMetric.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.fileAsset.deleteMany();
  await prisma.adminUser.deleteMany();
}

async function seedUsers(): Promise<void> {
  const users: { username: string; password: string; displayName: string; role: Prisma.AdminUserCreateInput['role']; email: string }[] = [
    { username: 'admin', password: 'admin123', displayName: '系统管理员', role: 'ADMIN', email: 'admin@cyberfish.cn' },
    { username: 'operator', password: 'operator123', displayName: '运营·小赛', role: 'OPERATOR', email: 'operator@cyberfish.cn' },
    { username: 'reviewer', password: 'reviewer123', displayName: '复核·小鱼', role: 'REVIEWER', email: 'reviewer@cyberfish.cn' },
    { username: 'viewer', password: 'viewer123', displayName: '访客·只读', role: 'VIEWER', email: 'viewer@cyberfish.cn' },
  ];

  for (const u of users) {
    await prisma.adminUser.create({
      data: {
        username: u.username,
        passwordHash: await hashPassword(u.password),
        displayName: u.displayName,
        role: u.role,
        email: u.email,
        lastLoginAt: dayjs().subtract(Math.floor(Math.random() * 48), 'hour').toDate(),
      },
    });
  }
}

async function seedAppVersions(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const list = [
    { versionName: '1.0.0', versionCode: 100, status: 'OFFLINE', updateType: 'OPTIONAL', releaseNotes: '首发版本：实时监控 + 基础识别' },
    { versionName: '1.1.0', versionCode: 110, status: 'ONLINE', updateType: 'OPTIONAL', releaseNotes: '优化夜间识别，新增昼夜主题' },
    { versionName: '1.2.0', versionCode: 120, status: 'GRAY', updateType: 'FORCE', releaseNotes: '升级 YOLOv8n-int8 模型，误报率下降 12%', grayPercent: 20 },
    { versionName: '1.3.0', versionCode: 130, status: 'DRAFT', updateType: 'OPTIONAL', releaseNotes: '（开发中）支持多漂同框与鱼种识别' },
  ] as const;

  for (const v of list) {
    const created = await prisma.appVersion.create({
      data: {
        versionName: v.versionName,
        versionCode: v.versionCode,
        platform: 'ANDROID',
        channel: 'official',
        updateType: v.updateType,
        releaseNotes: v.releaseNotes,
        minSupportedCode: v.versionCode >= 120 ? 100 : null,
        apkUrl: v.status === 'DRAFT' ? null : `/files/apk/cyberfish_${v.versionName}.apk`,
        apkSize: v.status === 'DRAFT' ? null : BigInt(38 * 1024 * 1024),
        apkSha256: v.status === 'DRAFT' ? null : `sha256_${CUID()}`,
        status: v.status,
        grayPercent: 'grayPercent' in v ? v.grayPercent : 0,
        onlineAt: v.status === 'ONLINE' ? dayjs().subtract(20, 'day').toDate() : null,
        offlineAt: v.status === 'OFFLINE' ? dayjs().subtract(35, 'day').toDate() : null,
        downloadCount: Math.floor(Math.random() * 8000),
        createdAt: dayjs().subtract(40 - v.versionCode / 10, 'day').toDate(),
      },
    });
    ids[String(v.versionCode)] = created.id;
  }
  return ids;
}

async function seedModels(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const list = [
    { modelVersion: 'yolov8n-int8-v1', name: '鱼漂识别 v1', arch: 'YOLOv8n', quant: 'INT8', status: 'OFFLINE', map50: 0.81, avgLatencyMs: 48 },
    { modelVersion: 'yolov8n-int8-v2', name: '鱼漂识别 v2', arch: 'YOLOv8n', quant: 'INT8', status: 'ONLINE', map50: 0.84, avgLatencyMs: 42 },
    { modelVersion: 'yolov8n-int8-v3', name: '鱼漂识别 v3（灰度）', arch: 'YOLOv8n', quant: 'INT8', status: 'GRAY', map50: 0.865, avgLatencyMs: 39 },
    { modelVersion: 'yolov8s-int8-v1', name: '鱼漂识别 S 增强版（草稿）', arch: 'YOLOv8s', quant: 'INT8', status: 'DRAFT', map50: 0.89, avgLatencyMs: 78 },
  ] as const;

  for (const m of list) {
    const created = await prisma.mlModel.create({
      data: {
        modelVersion: m.modelVersion,
        name: m.name,
        arch: m.arch,
        quant: m.quant,
        framework: 'TFLITE',
        fileUrl: m.status === 'DRAFT' ? null : `/files/models/${m.modelVersion}.tflite`,
        fileSize: m.status === 'DRAFT' ? null : BigInt(6 * 1024 * 1024),
        sha256: m.status === 'DRAFT' ? null : `sha256_${CUID()}`,
        inputSize: 640,
        numClasses: 1,
        labels: JSON.stringify(['鱼漂']),
        map50: m.map50,
        map50_95: Number((m.map50 - 0.28).toFixed(3)),
        precision: Number((m.map50 + 0.02).toFixed(3)),
        recall: Number((m.map50 - 0.03).toFixed(3)),
        avgLatencyMs: m.avgLatencyMs,
        minAppCode: 100,
        maxAppCode: null,
        status: m.status,
        publishedAt: m.status === 'DRAFT' ? null : dayjs().subtract(15, 'day').toDate(),
        remark: m.status === 'GRAY' ? '灰度验证中，重点关注夜间反光场景' : null,
        createdAt: dayjs().subtract(50, 'day').toDate(),
      },
    });
    ids[m.modelVersion] = created.id;
  }
  return ids;
}

async function seedAppUsersAndEvents(): Promise<void> {
  const versions = [100, 110, 120];
  const weights = [15, 55, 30]; // 版本分布权重
  const totalUsers = 240;

  const devicePrefixes = ['XIAOMI', 'HUAWEI', 'OPPO', 'VIVO', 'SAMSUNG', 'ONEPLUS'];
  const models = ['小米13', 'Mate60', 'FindX6', 'X100', 'Galaxy S23', '一加11'];

  const users: Prisma.AppUserCreateManyInput[] = [];
  for (let i = 0; i < totalUsers; i++) {
    const r = Math.random() * 100;
    let code = versions[0]!;
    if (r >= weights[0]! + weights[1]!) code = versions[2]!;
    else if (r >= weights[0]!) code = versions[1]!;
    const idx = Math.floor(Math.random() * devicePrefixes.length);
    users.push({
      deviceId: `DEV${String(i).padStart(5, '0')}`,
      userId: `U${10000 + i}`,
      channel: 'official',
      deviceModel: `${devicePrefixes[idx]} ${models[idx]}`,
      appVersionCode: code,
      modelVersion: code >= 120 ? 'yolov8n-int8-v2' : 'yolov8n-int8-v1',
      modelCallCount: 0,
      triggerCount: 0,
      firstSeenAt: dayjs().subtract(Math.floor(Math.random() * 60), 'day').toDate(),
      lastActiveAt: dayjs().subtract(Math.floor(Math.random() * 3), 'day').toDate(),
    });
  }
  await prisma.appUser.createMany({ data: users });

  // 事件：最近 30 天
  const events: Prisma.AppEventCreateManyInput[] = [];
  for (let d = 29; d >= 0; d--) {
    const day = dayjs().subtract(d, 'day');
    const active = Math.floor(40 + Math.random() * 80); // 当日活跃
    const callsPerActive = 120 + Math.floor(Math.random() * 60);
    const triggerRate = 0.02 + Math.random() * 0.01;
    const crashRate = 0.002 + Math.random() * 0.004;

    const activeSet = new Set<number>();
    while (activeSet.size < Math.min(active, totalUsers)) {
      activeSet.add(Math.floor(Math.random() * totalUsers));
    }

    for (const u of activeSet) {
      const deviceId = `DEV${String(u).padStart(5, '0')}`;
      events.push({
        deviceId,
        eventType: 'LAUNCH',
        appVersionCode: users[u]!.appVersionCode,
        modelVersion: users[u]!.modelVersion,
        count: 1,
        occurredAt: day.add(Math.floor(Math.random() * 18) + 5, 'hour').toDate(),
      });
    }

    // 模型调用 / 触发按天聚合，避免记录爆炸
    events.push({
      deviceId: 'AGG',
      eventType: 'MODEL_CALL',
      appVersionCode: 120,
      modelVersion: 'yolov8n-int8-v2',
      count: active * callsPerActive,
      occurredAt: day.toDate(),
    });
    events.push({
      deviceId: 'AGG',
      eventType: 'TRIGGER',
      appVersionCode: 120,
      modelVersion: 'yolov8n-int8-v2',
      count: Math.floor(active * callsPerActive * triggerRate),
      occurredAt: day.toDate(),
    });
    events.push({
      deviceId: 'AGG',
      eventType: 'CRASH',
      appVersionCode: 120,
      modelVersion: 'yolov8n-int8-v2',
      count: Math.floor(active * crashRate),
      occurredAt: day.toDate(),
    });
  }
  await prisma.appEvent.createMany({ data: events });
}

async function seedMisreports(): Promise<void> {
  const types = ['FALSE_POSITIVE', 'MISSED', 'MISIDENTIFY'] as const;
  const statuses = ['PENDING', 'REVIEWING', 'CONFIRMED', 'REJECTED', 'RESOLVED', 'CLOSED'] as const;
  const causes = ['WATER_REFLECTION', 'LIGHT', 'OCCLUSION', 'MODEL_LIMIT', 'THRESHOLD', 'DEVICE_PERF', 'USER_OP', 'OTHER'] as const;
  const gt = ['TRUE_FISH', 'FALSE_ALARM'] as const;

  const reviewers = await prisma.adminUser.findMany({
    where: { role: { in: ['REVIEWER', 'OPERATOR', 'ADMIN'] } },
    select: { id: true, displayName: true },
  });

  for (let i = 0; i < 60; i++) {
    const code = [100, 110, 120][Math.floor(Math.random() * 3)]!;
    const model = code >= 120 ? 'yolov8n-int8-v2' : 'yolov8n-int8-v1';
    const status = statuses[Math.floor(Math.random() * statuses.length)]!;
    const reportType = types[Math.floor(Math.random() * types.length)]!;
    const rootCause = causes[Math.floor(Math.random() * causes.length)]!;
    const reviewer = reviewers[Math.floor(Math.random() * reviewers.length)];
    const reviewed = ['CONFIRMED', 'REJECTED', 'RESOLVED', 'CLOSED'].includes(status);
    const day = dayjs().subtract(Math.floor(Math.random() * 30), 'day').add(Math.floor(Math.random() * 12) + 6, 'hour');

    await prisma.misreport.create({
      data: {
        reportNo: `MR${day.format('YYYYMMDD')}${String(i + 1).padStart(4, '0')}`,
        userId: `U${10000 + Math.floor(Math.random() * 240)}`,
        deviceId: `DEV${String(Math.floor(Math.random() * 240)).padStart(5, '0')}`,
        deviceModel: ['小米13', 'Mate60', 'FindX6', 'X100'][Math.floor(Math.random() * 4)],
        osVersion: 'Android 14',
        appVersionName: `1.${code % 10}.0`,
        appVersionCode: code,
        modelVersion: model,
        reportType,
        status,
        severity: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
        userNote: ['晚上灯光反射一直闪', '明明有鱼没提醒', '水草当成鱼漂了', '白天逆光误报多'][Math.floor(Math.random() * 4)],
        rawData: JSON.stringify({
          backend: 'NNAPI',
          fps: 24 + Math.floor(Math.random() * 8),
          confidence: Number((0.5 + Math.random() * 0.4).toFixed(3)),
          box: { x: 0.3, y: 0.4, w: 0.05, h: 0.08 },
        }),
        sceneTags: JSON.stringify(['夜钓', '反光'].slice(0, Math.floor(Math.random() * 2) + 1)),
        snapshotUrls: JSON.stringify(['/files/images/demo_float_1.png']),
        videoUrl: i % 5 === 0 ? '/files/videos/demo_clip.mp4' : null,
        thumbnailUrl: '/files/images/demo_float_1.png',
        rootCause: reviewed ? rootCause : null,
        groundTruth: reviewed ? gt[Math.floor(Math.random() * 2)]! : null,
        reviewerNote: reviewed ? '已确认并归入训练集候选' : null,
        resolution: status === 'RESOLVED' ? '将在 v1.3.0 修复' : null,
        addToTrainingSet: reviewed && Math.random() > 0.5,
        assignedToId: status !== 'PENDING' ? reviewer.id : null,
        reviewedById: reviewed ? reviewer.id : null,
        reviewedAt: reviewed ? day.add(2, 'hour').toDate() : null,
        reportedAt: day.toDate(),
        createdAt: day.toDate(),
      },
    });
  }

  // 状态流转日志（每条记录一条创建日志）
  const reports = await prisma.misreport.findMany({ select: { id: true } });
  for (const r of reports) {
    await prisma.misreportStatusLog.create({
      data: { misreportId: r.id, fromStatus: null, toStatus: 'PENDING', operatorName: 'system', note: '用户上报' },
    });
  }
}

async function seedDispatches(modelIds: Record<string, string>): Promise<void> {
  const onlineId = modelIds['yolov8n-int8-v2']!;
  const grayId = modelIds['yolov8n-int8-v3']!;

  // 一条已完成的全量下发（v1 -> v2）
  const d1 = await prisma.modelDispatch.create({
    data: {
      modelId: onlineId,
      targetType: 'GLOBAL',
      targetValue: JSON.stringify({}),
      grayPercent: 100,
      status: 'SUCCESS',
      totalDevices: 240,
      successDevices: 236,
      failedDevices: 4,
      startedAt: dayjs().subtract(15, 'day').toDate(),
      finishedAt: dayjs().subtract(14, 'day').toDate(),
      remark: 'v1 全量升级 v2',
    },
  });

  // 一条灰度下发（v3，20%）
  const d2 = await prisma.modelDispatch.create({
    data: {
      modelId: grayId,
      targetType: 'APP_VERSION',
      targetValue: JSON.stringify({ appCodes: [120] }),
      grayPercent: 20,
      status: 'DISPATCHING',
      totalDevices: 48,
      successDevices: 12,
      failedDevices: 1,
      startedAt: dayjs().subtract(1, 'day').toDate(),
      remark: 'v3 灰度：先覆盖 1.2.0 的 20% 设备',
    },
  });

  // 设备日志：v2 全量下发
  const logs1: Prisma.DeviceDispatchLogCreateManyInput[] = [];
  for (let i = 0; i < 240; i++) {
    const ok = i % 60 !== 0; // 4 台失败
    logs1.push({
      dispatchId: d1.id,
      deviceId: `DEV${String(i).padStart(5, '0')}`,
      fromModelVersion: 'yolov8n-int8-v1',
      toModelVersion: 'yolov8n-int8-v2',
      status: ok ? 'SUCCESS' : 'FAILED',
      progress: ok ? 100 : Math.floor(Math.random() * 60),
      errorCode: ok ? null : 'E_DOWNLOAD',
      errorMessage: ok ? null : '下载超时',
    });
  }
  await prisma.deviceDispatchLog.createMany({ data: logs1 });

  // 设备日志：v3 灰度（48 台，部分 PENDING / DOWNLOADING / SUCCESS）
  const logs2: Prisma.DeviceDispatchLogCreateManyInput[] = [];
  for (let i = 0; i < 48; i++) {
    const r = Math.random();
    const status = r < 0.4 ? 'PENDING' : r < 0.6 ? 'DOWNLOADING' : r < 0.95 ? 'SUCCESS' : 'FAILED';
    logs2.push({
      dispatchId: d2.id,
      deviceId: `DEV${String(i).padStart(5, '0')}`,
      fromModelVersion: 'yolov8n-int8-v2',
      toModelVersion: 'yolov8n-int8-v3',
      status,
      progress: status === 'SUCCESS' ? 100 : status === 'DOWNLOADING' ? Math.floor(Math.random() * 80) + 10 : 0,
    });
  }
  await prisma.deviceDispatchLog.createMany({ data: logs2 });
}

async function seedDailyMetrics(): Promise<void> {
  for (let d = 29; d >= 0; d--) {
    const day = dayjs().subtract(d, 'day');
    const dau = Math.floor(40 + Math.random() * 80);
    const mau = Math.min(240, dau * 3);
    const modelCalls = dau * (120 + Math.floor(Math.random() * 60));
    const triggers = Math.floor(modelCalls * 0.025);
    const misreports = Math.floor(Math.random() * 8);
    await prisma.dailyMetric.create({
      data: {
        date: day.startOf('day').toDate(),
        dau,
        mau,
        newUsers: d > 25 ? 0 : Math.floor(2 + Math.random() * 12),
        activeDevices: dau,
        modelCallCount: modelCalls,
        triggerCount: triggers,
        misreportCount: misreports,
        misreportRate: triggers > 0 ? Number((misreports / triggers).toFixed(4)) : 0,
        crashCount: Math.floor(dau * 0.003),
        avgInferenceMs: 38 + Math.floor(Math.random() * 12),
      },
    });
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('开始写入演示数据...');
  await wipe();
  await seedUsers();
  const versionIds = await seedAppVersions();
  const modelIds = await seedModels();
  await seedAppUsersAndEvents();
  await seedMisreports();
  await seedDispatches(modelIds);
  await seedDailyMetrics();

  // eslint-disable-next-line no-console
  console.log('演示数据写入完成。');
  console.log('  账号：admin/admin123、operator/operator123、reviewer/reviewer123、viewer/viewer123');
  console.log(`  APP 版本 ${Object.keys(versionIds).length} 个，模型 ${Object.keys(modelIds).length} 个，误报 60 条`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('种子数据写入失败：', err);
    await prisma.$disconnect();
    process.exit(1);
  });

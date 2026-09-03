import { Prisma } from '@prisma/client';
import { ReleaseStatus, UpdateType } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import { parseJson } from '../../lib/serialize';
import { inGray } from '../../lib/hash';
import type {
  AppVersionListQuery,
  CreateAppVersionInput,
  UpdateAppVersionInput,
  AppVersionActionInput,
  CheckUpdateQuery,
} from './schema';

function normalize<T extends { apkSize?: bigint | null; grayDeviceIds?: string | null }>(row: T) {
  return {
    ...row,
    apkSize: row.apkSize === null || row.apkSize === undefined ? null : Number(row.apkSize),
    grayDeviceIds: parseJson<string[]>(row.grayDeviceIds ?? '[]', []),
  };
}

export async function list(q: AppVersionListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['versionName', 'releaseNotes'],
    enumFilters: ['status', 'updateType', 'platform', 'channel'],
    rangeFilters: { createdAt: ['createdFrom', 'createdTo'] },
    sortWhitelist: ['createdAt', 'versionCode', 'onlineAt', 'downloadCount'],
    defaultSort: { versionCode: 'desc' },
  });

  const [rows, total] = await prisma.$transaction([
    prisma.appVersion.findMany({
      where: built.where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: { createdBy: { select: { id: true, displayName: true } } },
    }),
    prisma.appVersion.count({ where: built.where }),
  ]);

  return {
    list: rows.map(normalize),
    total,
    page: built.page,
    pageSize: built.pageSize,
  };
}

export async function detail(id: string) {
  const found = await prisma.appVersion.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  if (!found) throw AppError.notFound('APP 版本不存在');
  return normalize(found);
}

export async function create(input: CreateAppVersionInput, operatorId?: string) {
  const dup = await prisma.appVersion.findUnique({ where: { versionCode: input.versionCode } });
  if (dup) throw AppError.conflict(`versionCode ${input.versionCode} 已存在`);

  let apk: { url: string; size: bigint; sha256: string } | null = null;
  if (input.apkFileId) {
    const file = await prisma.fileAsset.findUnique({ where: { id: input.apkFileId } });
    if (!file) throw AppError.notFound('安装包文件不存在');
    if (file.bizType !== 'APK') throw AppError.badRequest('文件类型不是 APK');
    apk = { url: file.url, size: file.size, sha256: file.sha256 };
  }

  const created = await prisma.appVersion.create({
    data: {
      versionName: input.versionName,
      versionCode: input.versionCode,
      platform: input.platform,
      channel: input.channel,
      updateType: input.updateType,
      releaseNotes: input.releaseNotes,
      minSupportedCode: input.minSupportedCode ?? null,
      apkUrl: apk?.url ?? null,
      apkSize: apk?.size ?? null,
      apkSha256: apk?.sha256 ?? null,
      apkFileId: input.apkFileId ?? null,
      createdById: operatorId ?? null,
    },
  });
  return normalize(created);
}

export async function update(id: string, input: UpdateAppVersionInput) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  if (found.status === ReleaseStatus.ONLINE) {
    throw AppError.invalidState('已上架版本不可编辑，请先下架');
  }

  const data: Prisma.AppVersionUpdateInput = {};
  if (input.versionName !== undefined) data.versionName = input.versionName;
  if (input.platform !== undefined) data.platform = input.platform;
  if (input.channel !== undefined) data.channel = input.channel;
  if (input.updateType !== undefined) data.updateType = input.updateType;
  if (input.releaseNotes !== undefined) data.releaseNotes = input.releaseNotes;
  if (input.minSupportedCode !== undefined) data.minSupportedCode = input.minSupportedCode;
  if (input.grayPercent !== undefined) data.grayPercent = input.grayPercent;
  if (input.grayDeviceIds !== undefined) data.grayDeviceIds = JSON.stringify(input.grayDeviceIds);

  if (input.apkFileId && input.apkFileId !== found.apkFileId) {
    const file = await prisma.fileAsset.findUnique({ where: { id: input.apkFileId } });
    if (!file) throw AppError.notFound('安装包文件不存在');
    if (file.bizType !== 'APK') throw AppError.badRequest('文件类型不是 APK');
    data.apkUrl = file.url;
    data.apkSize = file.size;
    data.apkSha256 = file.sha256;
    data.apkFileId = file.id;
  }

  const updated = await prisma.appVersion.update({ where: { id }, data });
  return { before: normalize(found), after: normalize(updated) };
}

export async function remove(id: string) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  if (found.status !== ReleaseStatus.DRAFT) {
    throw AppError.invalidState('仅草稿状态的版本可删除');
  }
  await prisma.appVersion.delete({ where: { id } });
  return normalize(found);
}

/** 状态机动作 */
export async function doAction(id: string, input: AppVersionActionInput, operatorId?: string) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  if (!found.apkUrl) throw AppError.invalidState('请先上传安装包再发布');

  const before = normalize(found);
  let after: Record<string, unknown>;
  let previousOnline: Record<string, unknown> | null = null;

  switch (input.action) {
    case 'PUBLISH_GRAY': {
      if (!([ReleaseStatus.DRAFT, ReleaseStatus.GRAY, ReleaseStatus.OFFLINE] as ReleaseStatus[]).includes(found.status as ReleaseStatus)) {
        throw AppError.invalidState('当前状态无法进入灰度');
      }
      const grayPercent = input.grayPercent ?? found.grayPercent ?? 10;
      after = normalize(
        await prisma.appVersion.update({
          where: { id },
          data: {
            status: ReleaseStatus.GRAY,
            grayPercent,
            grayDeviceIds: JSON.stringify(input.deviceIds ?? parseJson<string[]>(found.grayDeviceIds, [])),
            updatedById: operatorId ?? null,
          },
        }),
      );
      break;
    }

    case 'PUBLISH_ONLINE': {
      // 同平台同渠道的旧 ONLINE 版本自动下架
      const olds = await prisma.appVersion.findMany({
        where: {
          status: ReleaseStatus.ONLINE,
          platform: found.platform,
          channel: found.channel,
          id: { not: id },
        },
      });
      for (const old of olds) {
        await prisma.appVersion.update({
          where: { id: old.id },
          data: { status: ReleaseStatus.OFFLINE, offlineAt: new Date() },
        });
      }
      previousOnline = olds.length ? { ids: olds.map((o) => o.id), versions: olds.map((o) => o.versionName) } : null;
      after = normalize(
        await prisma.appVersion.update({
          where: { id },
          data: {
            status: ReleaseStatus.ONLINE,
            grayPercent: 100,
            onlineAt: found.onlineAt ?? new Date(),
            offlineAt: null,
            updatedById: operatorId ?? null,
          },
        }),
      );
      break;
    }

    case 'OFFLINE': {
      if (found.status === ReleaseStatus.OFFLINE) throw AppError.invalidState('版本已处于下架状态');
      after = normalize(
        await prisma.appVersion.update({
          where: { id },
          data: { status: ReleaseStatus.OFFLINE, offlineAt: new Date(), updatedById: operatorId ?? null },
        }),
      );
      break;
    }

    case 'ROLLBACK': {
      // 当前版本退回草稿，并把上一个被下架的版本重新上架
      await prisma.appVersion.update({
        where: { id },
        data: { status: ReleaseStatus.DRAFT, grayPercent: 0, offlineAt: new Date(), updatedById: operatorId ?? null },
      });
      after = normalize(await prisma.appVersion.findUniqueOrThrow({ where: { id } }));

      const prev = await prisma.appVersion.findFirst({
        where: {
          platform: found.platform,
          channel: found.channel,
          status: ReleaseStatus.OFFLINE,
          versionCode: { lt: found.versionCode },
          id: { not: id },
        },
        orderBy: { versionCode: 'desc' },
      });
      if (prev) {
        await prisma.appVersion.update({
          where: { id: prev.id },
          data: { status: ReleaseStatus.ONLINE, onlineAt: new Date(), offlineAt: null },
        });
        previousOnline = { id: prev.id, versionName: prev.versionName, status: 'ONLINE' };
      }
      break;
    }

    default:
      throw AppError.badRequest(`不支持的动作：${String(input.action)}`);
  }

  return { before, after, previousOnline, reason: input.reason };
}

/** APP 端：检查更新 */
export async function checkUpdate(q: CheckUpdateQuery) {
  const candidates = await prisma.appVersion.findMany({
    where: {
      platform: q.platform,
      ...(q.channel ? { channel: q.channel } : {}),
      status: { in: [ReleaseStatus.ONLINE, ReleaseStatus.GRAY] },
      versionCode: { gt: q.versionCode },
    },
    orderBy: { versionCode: 'desc' },
  });

  // 命中判定：ONLINE 全部可见；GRAY 需命中灰度百分比或白名单
  const visible = candidates.filter((v) => {
    if (v.status === ReleaseStatus.ONLINE) return true;
    const whitelist = parseJson<string[]>(v.grayDeviceIds, []);
    if (whitelist.includes(q.deviceId)) return true;
    return inGray(`${v.id}:${q.deviceId}`, v.grayPercent);
  });

  const latest = visible[0];
  if (!latest) return { hasUpdate: false };

  const forceByMin =
    latest.minSupportedCode !== null && q.versionCode < latest.minSupportedCode;
  const updateType: UpdateType =
    forceByMin || latest.updateType === UpdateType.FORCE ? UpdateType.FORCE : (latest.updateType as UpdateType);

  return {
    hasUpdate: true,
    updateType,
    latest: {
      id: latest.id,
      versionName: latest.versionName,
      versionCode: latest.versionCode,
      channel: latest.channel,
      releaseNotes: latest.releaseNotes,
      apkUrl: latest.apkUrl,
      apkSize: latest.apkSize ? Number(latest.apkSize) : null,
      sha256: latest.apkSha256,
      publishedAt: latest.onlineAt,
    },
  };
}

/** 版本分布统计（看板复用） */
export async function stats() {
  const grouped = await prisma.appUser.groupBy({
    by: ['appVersionCode'],
    _count: { _all: true },
    orderBy: { appVersionCode: 'desc' },
  });
  const versions = await prisma.appVersion.findMany({
    select: { versionCode: true, versionName: true, status: true },
  });
  const nameMap = new Map(versions.map((v) => [v.versionCode, v.versionName]));
  const total = grouped.reduce((s, g) => s + g._count._all, 0);

  return grouped.map((g) => ({
    versionCode: g.appVersionCode,
    versionName: nameMap.get(g.appVersionCode) ?? `v${g.appVersionCode}`,
    devices: g._count._all,
    ratio: total > 0 ? Number((g._count._all / total).toFixed(4)) : 0,
  }));
}

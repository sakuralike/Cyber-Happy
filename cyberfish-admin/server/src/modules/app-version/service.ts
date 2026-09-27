import { Prisma } from '@prisma/client';
import { AppDownloadMode, ReleaseStatus, UpdateType } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import { parseJson } from '../../lib/serialize';
import { inGray } from '../../lib/hash';
import { resolveStoredFile } from '../../lib/storage';
import type {
  AppVersionListQuery,
  CreateAppVersionInput,
  UpdateAppVersionInput,
  AppVersionActionInput,
  CheckUpdateQuery,
} from './schema';
import { appVersionDownloadSchema } from './schema';

type DownloadInput = {
  downloadMode?: AppDownloadMode;
  apkUrl?: string | null;
  apkSize?: number | null;
  apkSha256?: string | null;
  apkFileId?: string | null;
  applicationId?: string | null;
  certificateSha256?: string | null;
};

export interface AppVersionReadiness {
  ready: boolean;
  status: 'READY' | 'MISSING_METADATA' | 'EXTERNAL_DOWNLOAD' | 'OFFLINE';
  checks: {
    download: { ready: boolean; mode: string; url: string | null; size: number | null; sha256: string | null };
    applicationId: { ready: boolean; value: string | null };
    versionName: { ready: boolean; value: string };
    versionCode: { ready: boolean; value: number };
    certificateSha256: { ready: boolean; value: string | null };
  };
  reasons: string[];
}

async function resolveDownload(input: DownloadInput) {
  const parsed = appVersionDownloadSchema.parse({
    ...input,
    apkUrl: input.apkFileId ? null : input.apkUrl,
  });
  const downloadMode = parsed.downloadMode ?? (parsed.apkFileId ? AppDownloadMode.SERVER : AppDownloadMode.EXTERNAL);
  if (parsed.apkFileId) {
    const file = await prisma.fileAsset.findUnique({ where: { id: parsed.apkFileId } });
    if (!file) throw AppError.notFound('安装包文件不存在');
    if (file.bizType !== 'APK') throw AppError.badRequest('文件类型不是 APK');
    return {
      downloadMode: AppDownloadMode.SERVER,
      apkUrl: file.url,
      apkSize: file.size,
      apkSha256: file.sha256.toLowerCase(),
      apkFileId: file.id,
    };
  }
  if (downloadMode === AppDownloadMode.EXTERNAL) {
    return {
      downloadMode: AppDownloadMode.EXTERNAL,
      apkUrl: parsed.apkUrl!,
      apkSize: null,
      apkSha256: null,
      apkFileId: null,
    };
  }
  throw AppError.badRequest('服务器模式必须上传 APK');
}

function normalize<T extends { apkSize?: bigint | null; grayDeviceIds?: string | null }>(row: T) {
  return {
    ...row,
    apkSize: row.apkSize === null || row.apkSize === undefined ? null : Number(row.apkSize),
    grayDeviceIds: parseJson<string[]>(row.grayDeviceIds ?? '[]', []),
  };
}

export function readiness(row: {
  status: string;
  versionName: string;
  versionCode: number;
  downloadMode: string;
  apkUrl: string | null;
  apkSize: bigint | null;
  apkSha256: string | null;
  apkFileId: string | null;
  applicationId: string | null;
  certificateSha256: string | null;
}): AppVersionReadiness {
  const download = {
    ready: row.downloadMode === AppDownloadMode.EXTERNAL
      ? Boolean(row.apkUrl)
      : Boolean(row.apkFileId && row.apkUrl && row.apkSize && row.apkSha256),
    mode: row.downloadMode,
    url: row.apkUrl,
    size: row.apkSize === null ? null : Number(row.apkSize),
    sha256: row.apkSha256,
  };
  const checks = {
    download,
    applicationId: { ready: row.downloadMode === AppDownloadMode.EXTERNAL || Boolean(row.applicationId), value: row.applicationId },
    versionName: { ready: /^\d+(\.\d+){0,3}$/.test(row.versionName), value: row.versionName },
    versionCode: { ready: Number.isInteger(row.versionCode) && row.versionCode > 0, value: row.versionCode },
    certificateSha256: {
      ready: row.downloadMode === AppDownloadMode.EXTERNAL || /^[a-fA-F0-9]{64}$/.test(row.certificateSha256 ?? ''),
      value: row.certificateSha256,
    },
  };
  const reasons: string[] = [];
  if (!checks.download.ready) reasons.push('服务器 APK 文件、大小或 SHA-256 缺失');
  if (!checks.applicationId.ready) reasons.push('applicationId 缺失');
  if (!checks.versionName.ready) reasons.push('versionName 无效');
  if (!checks.versionCode.ready) reasons.push('versionCode 无效');
  if (!checks.certificateSha256.ready) reasons.push('签名证书 SHA-256 缺失');
  const active = row.status === ReleaseStatus.ONLINE || row.status === ReleaseStatus.GRAY;
  return {
    ready: reasons.length === 0,
    status: !active ? 'OFFLINE' : row.downloadMode === AppDownloadMode.EXTERNAL ? 'EXTERNAL_DOWNLOAD' : reasons.length ? 'MISSING_METADATA' : 'READY',
    checks,
    reasons,
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
  return { ...normalize(found), readiness: readiness(found) };
}

export async function recordDownloadCompleted(id: string): Promise<void> {
  await prisma.appVersion.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
}

export async function download(id: string, deviceId?: string) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  if (found.status !== ReleaseStatus.ONLINE && found.status !== ReleaseStatus.GRAY) {
    throw AppError.notFound('APP 版本未公开');
  }
  if (found.status === ReleaseStatus.GRAY) {
    if (!deviceId) throw AppError.notFound('灰度版本未命中');
    const whitelist = parseJson<string[]>(found.grayDeviceIds, []);
    if (!whitelist.includes(deviceId) && !inGray(`${found.id}:${deviceId}`, found.grayPercent)) {
      throw AppError.notFound('灰度版本未命中');
    }
  }
  if (found.downloadMode !== AppDownloadMode.SERVER || !found.apkFileId || !found.apkUrl) {
    throw AppError.invalidState('该版本未配置服务器 APK 下载');
  }
  const asset = await prisma.fileAsset.findUnique({ where: { id: found.apkFileId } });
  if (!asset || asset.bizType !== 'APK') throw AppError.notFound('APK 文件不存在');
  const fullPath = resolveStoredFile(asset.url);
  if (!fullPath) throw AppError.notFound('APK 文件已丢失');
  return { version: found, asset, fullPath };
}

export async function create(input: CreateAppVersionInput, operatorId?: string) {
  const dup = await prisma.appVersion.findUnique({ where: { versionCode: input.versionCode } });
  if (dup) throw AppError.conflict(`versionCode ${input.versionCode} 已存在`);

  const download = await resolveDownload(input);

  const created = await prisma.appVersion.create({
    data: {
      versionName: input.versionName,
      versionCode: input.versionCode,
      platform: input.platform,
      channel: input.channel,
      updateType: input.updateType,
      releaseNotes: input.releaseNotes,
      minSupportedCode: input.minSupportedCode ?? null,
      applicationId: input.applicationId ?? null,
      certificateSha256: input.certificateSha256?.toLowerCase() ?? null,
      ...download,
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
  if (input.applicationId !== undefined) data.applicationId = input.applicationId;
  if (input.certificateSha256 !== undefined) data.certificateSha256 = input.certificateSha256?.toLowerCase() ?? null;
  if (input.grayPercent !== undefined) data.grayPercent = input.grayPercent;
  if (input.grayDeviceIds !== undefined) data.grayDeviceIds = JSON.stringify(input.grayDeviceIds);

  const hasDownloadChange = ['downloadMode', 'apkUrl', 'apkSize', 'apkSha256', 'apkFileId']
    .some((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (hasDownloadChange) {
    const requestedMode = input.downloadMode ?? (input.apkFileId ? AppDownloadMode.SERVER : found.downloadMode as AppDownloadMode);
    const download = await resolveDownload({
      downloadMode: requestedMode,
      apkUrl: input.apkUrl !== undefined ? input.apkUrl : found.apkUrl,
      apkSize: input.apkSize !== undefined ? input.apkSize : found.apkSize == null ? null : Number(found.apkSize),
      apkSha256: input.apkSha256 !== undefined ? input.apkSha256 : found.apkSha256,
      apkFileId: requestedMode === AppDownloadMode.EXTERNAL
        ? null
        : input.apkFileId !== undefined ? input.apkFileId : found.apkFileId,
    });
    Object.assign(data, download);
    if (requestedMode === AppDownloadMode.EXTERNAL) {
      data.applicationId = null;
      data.certificateSha256 = null;
    } else if (input.apkFileId !== undefined && input.apkFileId !== found.apkFileId) {
      data.applicationId = input.applicationId ?? null;
      data.certificateSha256 = input.certificateSha256?.toLowerCase() ?? null;
    }
  }

  const updated = await prisma.appVersion.update({ where: { id }, data });
  return { before: normalize(found), after: normalize(updated) };
}

export async function remove(id: string) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  if (found.status === ReleaseStatus.GRAY || found.status === ReleaseStatus.ONLINE) {
    throw AppError.invalidState('灰度或已上架版本不可删除，请先下架');
  }
  await prisma.appVersion.delete({ where: { id } });
  return normalize(found);
}

/** 状态机动作 */
export async function doAction(id: string, input: AppVersionActionInput, operatorId?: string) {
  const found = await prisma.appVersion.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('APP 版本不存在');
  const download = appVersionDownloadSchema.safeParse({
    downloadMode: found.downloadMode,
    apkUrl: found.apkFileId ? null : found.apkUrl,
    apkSize: found.apkSize == null ? null : Number(found.apkSize),
    apkSha256: found.apkSha256,
    apkFileId: found.apkFileId,
    applicationId: found.applicationId,
    certificateSha256: found.certificateSha256,
  });
  if (!download.success) {
    throw AppError.invalidState(download.error.issues[0]?.message ?? '请先完成下载配置再发布');
  }
  const before = normalize(found);
  let after: Record<string, unknown>;
  let previousOnline: Record<string, unknown> | null = null;

  switch (input.action) {
    case 'PUBLISH_GRAY': {
      const releaseReadiness = readiness(found);
      if (!releaseReadiness.ready) {
        throw AppError.invalidState(`发布前检查失败：${releaseReadiness.reasons.join('、')}`);
      }
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
      const releaseReadiness = readiness(found);
      if (!releaseReadiness.ready) {
        throw AppError.invalidState(`发布前检查失败：${releaseReadiness.reasons.join('、')}`);
      }
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
      downloadMode: latest.downloadMode,
      apkUrl: latest.downloadMode === AppDownloadMode.SERVER
        ? `/api/v1/app-versions/${latest.id}/download?deviceId=${encodeURIComponent(q.deviceId)}`
        : latest.apkUrl,
      apkSize: latest.apkSize ? Number(latest.apkSize) : null,
      sha256: latest.apkSha256,
      publishedAt: latest.onlineAt,
      applicationId: latest.applicationId,
      certificateSha256: latest.certificateSha256,
      downloadUrl: latest.downloadMode === AppDownloadMode.SERVER
        ? `/api/v1/app-versions/${latest.id}/download?deviceId=${encodeURIComponent(q.deviceId)}`
        : latest.apkUrl,
      readiness: readiness(latest),
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

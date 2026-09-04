import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import { parseJson } from '../../lib/serialize';
import { inGray } from '../../lib/hash';
import type {
  ModelListQuery,
  CreateModelInput,
  UpdateModelInput,
  DispatchInput,
  RollbackInput,
  DispatchListQuery,
  DeviceLogListQuery,
  CheckModelQuery,
} from './schema';

function normalizeModel<T extends { fileSize?: bigint | null; labels?: string | null }>(row: T) {
  return {
    ...row,
    fileSize: row.fileSize === null || row.fileSize === undefined ? null : Number(row.fileSize),
    labels: parseJson<string[]>(row.labels ?? '[]', []),
  };
}

function normalizeDispatch<T extends { targetValue?: string | null }>(row: T) {
  return { ...row, targetValue: parseJson<Record<string, unknown>>(row.targetValue ?? '{}', {}) };
}

// ============================================================
// 模型 CRUD
// ============================================================

export async function list(q: ModelListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['modelVersion', 'name', 'arch'],
    enumFilters: ['status', 'quant', 'framework'],
    rangeFilters: { createdAt: ['createdFrom', 'createdTo'] },
    sortWhitelist: ['createdAt', 'publishedAt', 'map50', 'avgLatencyMs'],
    defaultSort: { createdAt: 'desc' },
  });

  const [rows, total] = await prisma.$transaction([
    prisma.mlModel.findMany({
      where: built.where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: { createdBy: { select: { id: true, displayName: true } } },
    }),
    prisma.mlModel.count({ where: built.where }),
  ]);

  return {
    list: rows.map(normalizeModel),
    total,
    page: built.page,
    pageSize: built.pageSize,
  };
}

export async function detail(id: string) {
  const found = await prisma.mlModel.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  if (!found) throw AppError.notFound('模型不存在');

  const dispatches = await prisma.modelDispatch.findMany({
    where: { modelId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { operator: { select: { id: true, displayName: true } } },
  });

  return {
    ...normalizeModel(found),
    recentDispatches: dispatches.map(normalizeDispatch),
  };
}

export async function create(input: CreateModelInput, operatorId?: string) {
  const dup = await prisma.mlModel.findUnique({ where: { modelVersion: input.modelVersion } });
  if (dup) throw AppError.conflict(`模型版本 ${input.modelVersion} 已存在`);

  let file: { url: string; size: bigint; sha256: string } | null = null;
  if (input.fileId) {
    const f = await prisma.fileAsset.findUnique({ where: { id: input.fileId } });
    if (!f) throw AppError.notFound('模型文件不存在');
    if (f.bizType !== 'MODEL') throw AppError.badRequest('文件类型不是模型文件');
    file = { url: f.url, size: f.size, sha256: f.sha256 };
  }

  const created = await prisma.mlModel.create({
    data: {
      modelVersion: input.modelVersion,
      name: input.name,
      arch: input.arch,
      quant: input.quant,
      framework: input.framework,
      fileUrl: file?.url ?? null,
      fileSize: file?.size ?? null,
      sha256: file?.sha256 ?? null,
      fileId: input.fileId ?? null,
      inputSize: input.inputSize,
      numClasses: input.numClasses,
      labels: JSON.stringify(input.labels),
      map50: input.map50,
      map50_95: input.map50_95,
      precision: input.precision,
      recall: input.recall,
      avgLatencyMs: input.avgLatencyMs,
      minAppCode: input.minAppCode ?? null,
      maxAppCode: input.maxAppCode ?? null,
      remark: input.remark ?? null,
      signature: input.signature ?? null,
      signatureAlgorithm: input.signatureAlgorithm ?? null,
      publicKeyId: input.publicKeyId ?? null,
      signatureExpiresAt: input.signatureExpiresAt ?? null,
      runtimeSignatureName: input.runtimeSignatureName ?? null,
      inputName: input.inputName ?? null,
      inputLayout: input.inputLayout,
      outputName: input.outputName ?? null,
      coordinatesNormalized: input.coordinatesNormalized,
      valuesPerDetection: input.valuesPerDetection,
      createdById: operatorId ?? null,
    },
  });
  return normalizeModel(created);
}

export async function update(id: string, input: UpdateModelInput) {
  const found = await prisma.mlModel.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('模型不存在');

  // 已上线模型不可换文件，只能改元信息
  if (input.fileId && input.fileId !== found.fileId && found.status === 'ONLINE') {
    throw AppError.invalidState('已上线模型不可更换文件，请先下线');
  }

  const data: Prisma.MlModelUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.arch !== undefined) data.arch = input.arch;
  if (input.quant !== undefined) data.quant = input.quant;
  if (input.framework !== undefined) data.framework = input.framework;
  if (input.inputSize !== undefined) data.inputSize = input.inputSize;
  if (input.numClasses !== undefined) data.numClasses = input.numClasses;
  if (input.labels !== undefined) data.labels = JSON.stringify(input.labels);
  if (input.map50 !== undefined) data.map50 = input.map50;
  if (input.map50_95 !== undefined) data.map50_95 = input.map50_95;
  if (input.precision !== undefined) data.precision = input.precision;
  if (input.recall !== undefined) data.recall = input.recall;
  if (input.avgLatencyMs !== undefined) data.avgLatencyMs = input.avgLatencyMs;
  if (input.minAppCode !== undefined) data.minAppCode = input.minAppCode;
  if (input.maxAppCode !== undefined) data.maxAppCode = input.maxAppCode;
  if (input.remark !== undefined) data.remark = input.remark;
  if (input.signature !== undefined) data.signature = input.signature;
  if (input.signatureAlgorithm !== undefined) data.signatureAlgorithm = input.signatureAlgorithm;
  if (input.publicKeyId !== undefined) data.publicKeyId = input.publicKeyId;
  if (input.signatureExpiresAt !== undefined) data.signatureExpiresAt = input.signatureExpiresAt;
  if (input.runtimeSignatureName !== undefined) data.runtimeSignatureName = input.runtimeSignatureName;
  if (input.inputName !== undefined) data.inputName = input.inputName;
  if (input.inputLayout !== undefined) data.inputLayout = input.inputLayout;
  if (input.outputName !== undefined) data.outputName = input.outputName;
  if (input.coordinatesNormalized !== undefined) data.coordinatesNormalized = input.coordinatesNormalized;
  if (input.valuesPerDetection !== undefined) data.valuesPerDetection = input.valuesPerDetection;

  if (input.fileId && input.fileId !== found.fileId) {
    const f = await prisma.fileAsset.findUnique({ where: { id: input.fileId } });
    if (!f) throw AppError.notFound('模型文件不存在');
    if (f.bizType !== 'MODEL') throw AppError.badRequest('文件类型不是模型文件');
    data.fileUrl = f.url;
    data.fileSize = f.size;
    data.sha256 = f.sha256;
    data.fileId = f.id;
  }

  const updated = await prisma.mlModel.update({ where: { id }, data });
  return { before: normalizeModel(found), after: normalizeModel(updated) };
}

export async function remove(id: string) {
  const found = await prisma.mlModel.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('模型不存在');
  if (found.status !== 'DRAFT') throw AppError.invalidState('仅草稿状态的模型可删除');
  await prisma.mlModel.delete({ where: { id } });
  return normalizeModel(found);
}

// ============================================================
// 下发
// ============================================================

/** 依据下发目标筛选命中的设备列表 */
async function matchDevices(
  targetType: DispatchInput['targetType'],
  targetValue: Record<string, unknown>,
): Promise<{ deviceId: string; fromModelVersion: string }[]> {
  const where: Prisma.AppUserWhereInput = {};

  if (targetType === 'APP_VERSION') {
    const codes = Array.isArray(targetValue.appCodes)
      ? targetValue.appCodes.map(Number).filter((n) => Number.isFinite(n))
      : [];
    if (codes.length) where.appVersionCode = { in: codes };
  } else if (targetType === 'DEVICE_GROUP') {
    const groups = Array.isArray(targetValue.groups) ? targetValue.groups.map(String) : [];
    if (groups.length) where.channel = { in: groups };
  } else if (targetType === 'DEVICE_ID') {
    const ids = Array.isArray(targetValue.deviceIds) ? targetValue.deviceIds.map(String) : [];
    if (ids.length) where.deviceId = { in: ids };
  }

  const users = await prisma.appUser.findMany({
    where,
    select: { deviceId: true, modelVersion: true },
    orderBy: { deviceId: 'asc' },
    take: 5000,
  });

  return users.map((u) => ({ deviceId: u.deviceId, fromModelVersion: u.modelVersion || '' }));
}

export async function dispatch(modelId: string, input: DispatchInput, operatorId?: string) {
  const model = await prisma.mlModel.findUnique({ where: { id: modelId } });
  if (!model) throw AppError.notFound('模型不存在');
  if (!model.fileUrl) throw AppError.invalidState('模型文件未上传，无法下发');

  const devices = await matchDevices(input.targetType, input.targetValue);
  // 灰度过滤
  const targeted =
    input.grayPercent >= 100
      ? devices
      : devices.filter((d) => inGray(`${modelId}:${d.deviceId}`, input.grayPercent));

  const dispatch = await prisma.modelDispatch.create({
    data: {
      modelId,
      targetType: input.targetType,
      targetValue: JSON.stringify(input.targetValue),
      grayPercent: input.grayPercent,
      totalDevices: targeted.length,
      status: 'PENDING',
      remark: input.remark ?? null,
      operatorId: operatorId ?? null,
      appVersionId: input.appVersionId ?? null,
      deviceLogs: {
        create: targeted.map((d) => ({
          deviceId: d.deviceId,
          fromModelVersion: d.fromModelVersion,
          toModelVersion: model.modelVersion,
          status: 'PENDING',
        })),
      },
    },
  });

  // 模型状态推进
  const nextStatus = input.grayPercent >= 100 ? 'ONLINE' : 'GRAY';
  await prisma.mlModel.update({
    where: { id: modelId },
    data: { status: nextStatus, publishedAt: new Date(), isRollback: false },
  });

  return {
    ...normalizeDispatch(dispatch),
    matchedDevices: targeted.length,
    before: { status: model.status },
  };
}

export async function rollback(modelId: string, input: RollbackInput, operatorId?: string) {
  const from = await prisma.mlModel.findUnique({ where: { id: modelId } });
  if (!from) throw AppError.notFound('被回滚的模型不存在');

  const to = await prisma.mlModel.findUnique({ where: { id: input.toModelId } });
  if (!to) throw AppError.notFound('回滚目标模型不存在');
  if (to.id === from.id) throw AppError.badRequest('不能回滚到自身');
  if (!to.fileUrl) throw AppError.invalidState('回滚目标模型缺少文件');

  // 找到原下发单（取最近一条非回滚单）作为回滚范围依据
  const origin = await prisma.modelDispatch.findFirst({
    where: { modelId, isRollback: false },
    orderBy: { createdAt: 'desc' },
  });

  const deviceIds = origin
    ? (
        await prisma.deviceDispatchLog.findMany({
          where: {
            dispatchId: origin.id,
            ...(input.scope === 'FAILED_ONLY' ? { status: 'FAILED' } : {}),
          },
          select: { deviceId: true },
        })
      ).map((d) => d.deviceId)
    : (await prisma.appUser.findMany({ select: { deviceId: true }, take: 5000 })).map(
        (u) => u.deviceId,
      );

  const target = await prisma.modelDispatch.create({
    data: {
      modelId: to.id,
      targetType: 'DEVICE_ID',
      targetValue: JSON.stringify({ deviceIds }),
      grayPercent: 100,
      totalDevices: deviceIds.length,
      status: 'DISPATCHING',
      isRollback: true,
      rollbackFromId: origin?.id ?? null,
      remark: `回滚：${from.modelVersion} → ${to.modelVersion}（${input.reason}）`,
      operatorId: operatorId ?? null,
      startedAt: new Date(),
      deviceLogs: {
        create: deviceIds.map((deviceId) => ({
          deviceId,
          fromModelVersion: from.modelVersion,
          toModelVersion: to.modelVersion,
          status: 'PENDING',
        })),
      },
    },
  });

  await prisma.mlModel.update({
    where: { id: modelId },
    data: { status: 'ROLLBACK', isRollback: true, rollbackToId: to.id },
  });
  await prisma.mlModel.update({
    where: { id: to.id },
    data: { status: 'ONLINE', publishedAt: new Date() },
  });
  if (origin) {
    await prisma.modelDispatch.update({
      where: { id: origin.id },
      data: { status: 'ROLLED_BACK', finishedAt: new Date() },
    });
  }

  return {
    rollbackDispatchId: target.id,
    from: { id: from.id, modelVersion: from.modelVersion },
    to: { id: to.id, modelVersion: to.modelVersion },
    affectedDevices: deviceIds.length,
    status: target.status,
    before: { status: from.status },
  };
}

// ============================================================
// 下发状态追踪
// ============================================================

export async function dispatchList(q: DispatchListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['remark'],
    enumFilters: ['status', 'targetType'],
    exactFilters: ['modelId', 'operatorId'],
    rangeFilters: { createdAt: ['createdFrom', 'createdTo'] },
    sortWhitelist: ['createdAt', 'totalDevices', 'finishedAt'],
    defaultSort: { createdAt: 'desc' },
  });

  const [rows, total] = await prisma.$transaction([
    prisma.modelDispatch.findMany({
      where: built.where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: {
        model: { select: { id: true, modelVersion: true, arch: true, quant: true } },
        operator: { select: { id: true, displayName: true } },
      },
    }),
    prisma.modelDispatch.count({ where: built.where }),
  ]);

  return {
    list: rows.map((r) => ({
      ...normalizeDispatch(r),
      model: r.model,
      operator: r.operator,
    })),
    total,
    page: built.page,
    pageSize: built.pageSize,
  };
}

export async function modelDispatchList(modelId: string, q: RawListQuery) {
  const built = buildListQuery(q, {
    enumFilters: ['status'],
    sortWhitelist: ['createdAt'],
    defaultSort: { createdAt: 'desc' },
  });
  const where = { ...built.where, modelId } as Prisma.ModelDispatchWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.modelDispatch.findMany({
      where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: { operator: { select: { id: true, displayName: true } } },
    }),
    prisma.modelDispatch.count({ where }),
  ]);
  return { list: rows.map(normalizeDispatch), total, page: built.page, pageSize: built.pageSize };
}

export async function deviceLogList(dispatchId: string, q: DeviceLogListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['deviceId'],
    enumFilters: ['status'],
    sortWhitelist: ['updatedAt', 'createdAt', 'progress'],
    defaultSort: { updatedAt: 'desc' },
  });
  const where = { ...built.where, dispatchId } as Prisma.DeviceDispatchLogWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.deviceDispatchLog.findMany({
      where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
    }),
    prisma.deviceDispatchLog.count({ where }),
  ]);
  return { list: rows, total, page: built.page, pageSize: built.pageSize };
}

export async function retryFailed(dispatchId: string) {
  const dispatch = await prisma.modelDispatch.findUnique({ where: { id: dispatchId } });
  if (!dispatch) throw AppError.notFound('下发单不存在');

  const failed = await prisma.deviceDispatchLog.findMany({
    where: { dispatchId, status: { in: ['FAILED'] } },
  });
  if (!failed.length) throw AppError.invalidState('没有失败的设备需要重试');

  await prisma.deviceDispatchLog.updateMany({
    where: { dispatchId, status: 'FAILED' },
    data: { status: 'PENDING', retryCount: { increment: 1 }, errorMessage: null, errorCode: null },
  });
  await prisma.modelDispatch.update({
    where: { id: dispatchId },
    data: { status: 'DISPATCHING', finishedAt: null },
  });

  return { dispatchId, retried: failed.length, before: { status: dispatch.status } };
}

// ============================================================
// APP 端接口
// ============================================================

export async function checkModel(q: CheckModelQuery) {
  const candidates = await prisma.mlModel.findMany({
    where: {
      status: { in: ['ONLINE', 'GRAY'] },
      ...(q.currentModelVersion ? { modelVersion: { not: q.currentModelVersion } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  // 该设备已被纳入的下发单（灰度命中由此判定，保证与后台一致）
  const myLogs = await prisma.deviceDispatchLog.findMany({
    where: { deviceId: q.deviceId },
    select: { toModelVersion: true, status: true },
  });
  const targetedVersions = new Set(myLogs.map((l) => l.toModelVersion));

  const hit = candidates.find((m) => {
    if (m.minAppCode !== null && q.appVersionCode < m.minAppCode) return false;
    if (m.maxAppCode !== null && q.appVersionCode > m.maxAppCode) return false;
    // ONLINE 对所有设备可见；GRAY 仅对已被下发单命中的设备可见
    return m.status === 'ONLINE' ? true : targetedVersions.has(m.modelVersion);
  });

  if (!hit) return { hasUpdate: false };

  const latestDispatch = await prisma.modelDispatch.findFirst({
    where: { modelId: hit.id },
    orderBy: { createdAt: 'desc' },
  });

  return {
    hasUpdate: true,
    model: {
      id: hit.id,
      modelVersion: hit.modelVersion,
      arch: hit.arch,
      quant: hit.quant,
      inputSize: hit.inputSize,
      url: hit.fileUrl,
      size: hit.fileSize ? Number(hit.fileSize) : null,
      sha256: hit.sha256,
      minAppCode: hit.minAppCode,
      labels: parseJson<string[]>(hit.labels, []),
      signature: hit.signature,
      signatureAlgorithm: hit.signatureAlgorithm,
      publicKeyId: hit.publicKeyId,
      signatureExpiresAt: hit.signatureExpiresAt,
      runtimeSignatureName: hit.runtimeSignatureName,
      inputName: hit.inputName,
      inputLayout: hit.inputLayout,
      outputName: hit.outputName,
      coordinatesNormalized: hit.coordinatesNormalized,
      valuesPerDetection: hit.valuesPerDetection,
    },
    dispatchId: latestDispatch?.id ?? null,
  };
}

export async function reportDispatch(
  dispatchId: string,
  input: { deviceId: string; status: 'PENDING' | 'DOWNLOADING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK'; progress?: number; errorCode?: string; errorMessage?: string },
) {
  const log = await prisma.deviceDispatchLog.findFirst({
    where: { dispatchId, deviceId: input.deviceId },
  });
  if (!log) throw AppError.notFound('未找到该设备的下发记录');

  const updated = await prisma.deviceDispatchLog.update({
    where: { id: log.id },
    data: {
      status: input.status,
      progress: input.progress ?? (input.status === 'SUCCESS' ? 100 : log.progress),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  });

  // 回写下发单聚合计数
  const agg = await prisma.deviceDispatchLog.groupBy({
    by: ['status'],
    where: { dispatchId },
    _count: { _all: true },
  });
  const count = (s: string) => agg.find((a) => a.status === s)?._count._all ?? 0;
  const success = count('SUCCESS');
  const failed = count('FAILED');
  const total = agg.reduce((s, a) => s + a._count._all, 0);

  let status: 'PENDING' | 'DISPATCHING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'DISPATCHING';
  if (success === total && total > 0) status = 'SUCCESS';
  else if (success > 0 && failed > 0) status = 'PARTIAL';
  else if (failed === total && total > 0) status = 'FAILED';

  await prisma.modelDispatch.update({
    where: { id: dispatchId },
    data: {
      successDevices: success,
      failedDevices: failed,
      totalDevices: total,
      status,
      startedAt: new Date(),
      finishedAt: ['SUCCESS', 'PARTIAL', 'FAILED'].includes(status) ? new Date() : null,
    },
  });

  return updated;
}

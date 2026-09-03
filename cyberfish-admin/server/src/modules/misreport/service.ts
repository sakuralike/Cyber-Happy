import { Prisma } from '@prisma/client';
import { MisreportStatus } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, buildExportQuery, type RawListQuery } from '../../lib/query';
import { parseJson } from '../../lib/serialize';
import type {
  MisreportListQuery,
  ReviewInput,
  AssignInput,
  UpdateMisreportInput,
  BatchInput,
  CreateMisreportInput,
} from './schema';

function normalize<T extends { rawData?: string | null; snapshotUrls?: string | null; sceneTags?: string | null }>(row: T) {
  return {
    ...row,
    rawData: parseJson<Record<string, unknown>>(row.rawData ?? '{}', {}),
    snapshotUrls: parseJson<string[]>(row.snapshotUrls ?? '[]', []),
    sceneTags: parseJson<string[]>(row.sceneTags ?? '[]', []),
  };
}

/** 生成单号 MR + yyyyMMdd + 4 位序列（同日自增） */
async function nextReportNo(): Promise<string> {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const prefix = `MR${y}${m}${d}`;

  const last = await prisma.misreport.findFirst({
    where: { reportNo: { startsWith: prefix } },
    orderBy: { reportNo: 'desc' },
    select: { reportNo: true },
  });
  const seq = last ? Number(last.reportNo.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function appendStatusLog(
  misreportId: string,
  fromStatus: MisreportStatus | null,
  toStatus: MisreportStatus,
  operatorId: string | undefined,
  operatorName: string,
  note?: string,
): Promise<void> {
  await prisma.misreportStatusLog.create({
    data: { misreportId, fromStatus, toStatus, operatorId: operatorId ?? null, operatorName, note: note ?? null },
  });
}

// ============================================================
// 列表 / 详情
// ============================================================

export async function list(q: MisreportListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['reportNo', 'userId', 'deviceId', 'userNote'],
    enumFilters: ['status', 'reportType', 'severity', 'rootCause'],
    numberFilters: ['appVersionCode'],
    exactFilters: ['modelVersion', 'assignedToId'],
    rangeFilters: { reportedAt: ['reportedFrom', 'reportedTo'] },
    sortWhitelist: ['reportedAt', 'createdAt', 'severity', 'status'],
    defaultSort: { reportedAt: 'desc' },
  });

  const [rows, total] = await prisma.$transaction([
    prisma.misreport.findMany({
      where: built.where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: {
        assignedTo: { select: { id: true, displayName: true } },
        reviewedBy: { select: { id: true, displayName: true } },
      },
    }),
    prisma.misreport.count({ where: built.where }),
  ]);

  return {
    list: rows.map((r) => ({
      ...normalize(r),
      assignedToName: r.assignedTo?.displayName ?? null,
      reviewedByName: r.reviewedBy?.displayName ?? null,
    })),
    total,
    page: built.page,
    pageSize: built.pageSize,
  };
}

export async function detail(id: string) {
  const found = await prisma.misreport.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, displayName: true, username: true } },
      reviewedBy: { select: { id: true, displayName: true, username: true } },
      statusLogs: {
        orderBy: { createdAt: 'asc' },
        include: { operator: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!found) throw AppError.notFound('误报记录不存在');
  return normalize(found);
}

export async function statusLogs(id: string) {
  const found = await prisma.misreport.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw AppError.notFound('误报记录不存在');
  return prisma.misreportStatusLog.findMany({
    where: { misreportId: id },
    orderBy: { createdAt: 'asc' },
    include: { operator: { select: { id: true, displayName: true } } },
  });
}

// ============================================================
// 复核流转
// ============================================================

export async function review(
  id: string,
  input: ReviewInput,
  operator: { id: string; displayName: string },
) {
  const found = await prisma.misreport.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('误报记录不存在');

  const data: Prisma.MisreportUpdateInput = {
    status: input.status,
    reviewedBy: { connect: { id: operator.id } },
    reviewedAt: new Date(),
  };
  if (input.groundTruth !== undefined) data.groundTruth = input.groundTruth;
  if (input.rootCause !== undefined) data.rootCause = input.rootCause;
  if (input.reviewerNote !== undefined) data.reviewerNote = input.reviewerNote;
  if (input.resolution !== undefined) data.resolution = input.resolution;
  if (input.sceneTags !== undefined) data.sceneTags = JSON.stringify(input.sceneTags);
  if (input.addToTrainingSet !== undefined) data.addToTrainingSet = input.addToTrainingSet;

  const updated = await prisma.misreport.update({ where: { id }, data });
  await appendStatusLog(id, found.status as MisreportStatus, input.status, operator.id, operator.displayName, input.reviewerNote);

  return { before: normalize(found), after: normalize(updated) };
}

export async function assign(
  id: string,
  input: AssignInput,
  operator: { id: string; displayName: string },
) {
  const found = await prisma.misreport.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('误报记录不存在');

  const target = await prisma.adminUser.findUnique({
    where: { id: input.assignedToId },
    select: { id: true, displayName: true, status: true },
  });
  if (!target) throw AppError.notFound('指派的账号不存在');
  if (target.status === 'DISABLED') throw AppError.invalidState('不能指派给已禁用的账号');

  const nextStatus: MisreportStatus =
    found.status === MisreportStatus.PENDING ? MisreportStatus.REVIEWING : (found.status as MisreportStatus);

  const updated = await prisma.misreport.update({
    where: { id },
    data: { assignedToId: input.assignedToId, status: nextStatus },
  });
  await appendStatusLog(
    id,
    found.status as MisreportStatus,
    nextStatus,
    operator.id,
    operator.displayName,
    input.note ?? `指派给 ${target.displayName}`,
  );

  return {
    before: normalize(found),
    after: normalize(updated),
    assigneeName: target.displayName,
  };
}

export async function update(id: string, input: UpdateMisreportInput) {
  const found = await prisma.misreport.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('误报记录不存在');

  const data: Prisma.MisreportUpdateInput = {};
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.sceneTags !== undefined) data.sceneTags = JSON.stringify(input.sceneTags);
  if (input.userNote !== undefined) data.userNote = input.userNote;

  const updated = await prisma.misreport.update({ where: { id }, data });
  return { before: normalize(found), after: normalize(updated) };
}

export async function batch(input: BatchInput, operator: { id: string; displayName: string }) {
  const rows = await prisma.misreport.findMany({ where: { id: { in: input.ids } } });
  if (!rows.length) throw AppError.notFound('未找到任何记录');

  let affected = 0;
  for (const row of rows) {
    if (input.action === 'ASSIGN') {
      if (!input.assignedToId) throw AppError.badRequest('批量指派必须提供 assignedToId');
      await assign(row.id, { assignedToId: input.assignedToId }, operator);
    } else {
      if (!input.status) throw AppError.badRequest('批量复核必须提供 status');
      await review(
        row.id,
        {
          status: input.status,
          rootCause: input.rootCause,
          reviewerNote: input.reviewerNote,
        },
        operator,
      );
    }
    affected++;
  }

  return { affected, ids: rows.map((r) => r.id) };
}

// ============================================================
// 导出与统计
// ============================================================

export async function exportCsv(q: MisreportListQuery & RawListQuery): Promise<string> {
  const { where, orderBy, take } = buildExportQuery(q, {
    keywordFields: ['reportNo', 'userId', 'deviceId', 'userNote'],
    enumFilters: ['status', 'reportType', 'severity', 'rootCause'],
    numberFilters: ['appVersionCode'],
    exactFilters: ['modelVersion', 'assignedToId'],
    rangeFilters: { reportedAt: ['reportedFrom', 'reportedTo'] },
    sortWhitelist: ['reportedAt', 'createdAt', 'severity', 'status'],
    defaultSort: { reportedAt: 'desc' },
  });

  const rows = await prisma.misreport.findMany({
    where,
    orderBy,
    take,
    include: { assignedTo: { select: { displayName: true } }, reviewedBy: { select: { displayName: true } } },
  });

  const header = [
    '单号', '上报时间', '用户ID', '设备ID', 'APP版本', '模型版本',
    '类型', '状态', '严重度', '根因', 'GroundTruth', '处理人', '复核人', '是否入训练集', '用户描述',
  ];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.reportNo,
        r.reportedAt.toISOString(),
        r.userId,
        r.deviceId,
        r.appVersionName,
        r.modelVersion,
        r.reportType,
        r.status,
        r.severity,
        r.rootCause ?? '',
        r.groundTruth ?? '',
        r.assignedTo?.displayName ?? '',
        r.reviewedBy?.displayName ?? '',
        r.addToTrainingSet ? '是' : '否',
        r.userNote,
      ]
        .map(escape)
        .join(','),
    );
  }
  // BOM 保证 Excel 正确识别 UTF-8
  return `\uFEFF${lines.join('\n')}`;
}

export async function stats() {
  const [total, byStatus, byRootCause, byType, trainingSet] = await Promise.all([
    prisma.misreport.count(),
    prisma.misreport.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.misreport.groupBy({ by: ['rootCause'], _count: { _all: true }, where: { rootCause: { not: null } } }),
    prisma.misreport.groupBy({ by: ['reportType'], _count: { _all: true } }),
    prisma.misreport.count({ where: { addToTrainingSet: true } }),
  ]);

  return {
    total,
    trainingSet,
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    byRootCause: byRootCause
      .map((s) => ({ rootCause: s.rootCause, count: s._count._all }))
      .sort((a, b) => b.count - a.count),
    byType: byType.map((s) => ({ reportType: s.reportType, count: s._count._all })),
  };
}

// ============================================================
// APP 端上报
// ============================================================

export async function create(input: CreateMisreportInput) {
  const reportNo = await nextReportNo();
  const created = await prisma.misreport.create({
    data: {
      reportNo,
      userId: input.userId,
      deviceId: input.deviceId,
      deviceModel: input.deviceModel ?? '',
      osVersion: input.osVersion ?? '',
      appVersionName: input.appVersionName ?? '',
      appVersionCode: input.appVersionCode ?? 0,
      modelVersion: input.modelVersion ?? '',
      reportType: input.reportType,
      severity: input.severity,
      userNote: input.userNote ?? '',
      rawData: JSON.stringify(input.rawData ?? {}),
      sceneTags: JSON.stringify(input.sceneTags ?? []),
      snapshotUrls: JSON.stringify(input.snapshotUrls ?? []),
      videoUrl: input.videoUrl ?? null,
      thumbnailUrl: input.snapshotUrls?.[0] ?? null,
      reportedAt: input.reportedAt ? new Date(input.reportedAt) : new Date(),
      status: MisreportStatus.PENDING,
    },
  });
  await appendStatusLog(created.id, null, MisreportStatus.PENDING, undefined, 'system', '用户上报');
  return normalize(created);
}

import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import { parseJson } from '../../lib/serialize';
import { AuditModule, AuditAction } from '../../lib/enums';
import type { AuditLogListQuery } from './schema';

function normalize<T extends { before?: string | null; after?: string | null }>(row: T) {
  return {
    ...row,
    before: parseJson<unknown>(row.before, null),
    after: parseJson<unknown>(row.after, null),
  };
}

export async function list(q: AuditLogListQuery & RawListQuery, viewerRole?: string, viewerId?: string) {
  const built = buildListQuery(q, {
    keywordFields: ['operatorName', 'targetName', 'targetId'],
    enumFilters: ['module', 'action', 'result'],
    exactFilters: ['operatorId', 'targetType'],
    rangeFilters: { createdAt: ['createdFrom', 'createdTo'] },
    sortWhitelist: ['createdAt', 'module', 'action'],
    defaultSort: { createdAt: 'desc' },
  });

  // VIEWER 只能看到自己的操作记录
  const where =
    viewerRole === 'VIEWER'
      ? ({ AND: [built.where, { operatorId: viewerId ?? '__none__' }] } as typeof built.where)
      : built.where;

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      include: { operator: { select: { id: true, username: true, displayName: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    list: rows.map(normalize),
    total,
    page: built.page,
    pageSize: built.pageSize,
  };
}

export async function detail(id: string) {
  const found = await prisma.auditLog.findUnique({
    where: { id },
    include: { operator: { select: { id: true, username: true, displayName: true, role: true } } },
  });
  if (!found) throw AppError.notFound('操作日志不存在');
  return normalize(found);
}

export function meta() {
  return {
    modules: Object.values(AuditModule),
    actions: Object.values(AuditAction),
  };
}

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import { hashPassword } from '../../lib/hash';
import type { AdminListQuery, CreateAdminInput, UpdateAdminInput } from './schema';

const SAFE_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  status: true,
  email: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminUserSelect;

export async function list(q: AdminListQuery & RawListQuery) {
  const built = buildListQuery(q, {
    keywordFields: ['username', 'displayName'],
    enumFilters: ['role', 'status'],
    sortWhitelist: ['createdAt', 'username', 'lastLoginAt'],
    defaultSort: { createdAt: 'desc' },
  });
  const [list, total] = await prisma.$transaction([
    prisma.adminUser.findMany({
      where: built.where,
      orderBy: built.orderBy,
      skip: built.skip,
      take: built.take,
      select: SAFE_SELECT,
    }),
    prisma.adminUser.count({ where: built.where }),
  ]);
  return { list, total, page: built.page, pageSize: built.pageSize };
}

export async function detail(id: string) {
  const found = await prisma.adminUser.findUnique({ where: { id }, select: SAFE_SELECT });
  if (!found) throw AppError.notFound('账号不存在');
  return found;
}

export async function create(input: CreateAdminInput, operatorId?: string) {
  const exists = await prisma.adminUser.findUnique({ where: { username: input.username } });
  if (exists) throw AppError.conflict(`用户名 ${input.username} 已存在`);

  const created = await prisma.adminUser.create({
    data: {
      username: input.username,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName,
      role: input.role,
      email: input.email || null,
    },
    select: SAFE_SELECT,
  });
  return created;
}

export async function update(id: string, input: UpdateAdminInput) {
  const found = await prisma.adminUser.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('账号不存在');

  // 不允许把自己禁用，避免系统锁死
  if (input.status === 'DISABLED' && found.role === 'ADMIN') {
    const adminCount = await prisma.adminUser.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) throw AppError.invalidState('系统至少需要保留 1 个启用的管理员');
  }

  const data: Prisma.AdminUserUpdateInput = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.role !== undefined) data.role = input.role;
  if (input.status !== undefined) data.status = input.status;
  if (input.email !== undefined) data.email = input.email || null;
  if (input.password) data.passwordHash = await hashPassword(input.password);

  const updated = await prisma.adminUser.update({ where: { id }, data, select: SAFE_SELECT });
  return { before: found, after: updated };
}

export async function remove(id: string) {
  const found = await prisma.adminUser.findUnique({ where: { id } });
  if (!found) throw AppError.notFound('账号不存在');
  if (found.role === 'ADMIN') {
    const adminCount = await prisma.adminUser.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) throw AppError.invalidState('系统至少需要保留 1 个启用的管理员，无法删除');
  }
  // 软删：改为禁用，保留审计链路
  await prisma.adminUser.update({ where: { id }, data: { status: 'DISABLED' } });
  return found;
}

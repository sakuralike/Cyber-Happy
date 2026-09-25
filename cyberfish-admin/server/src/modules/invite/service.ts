import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { config } from '../../config';
import { buildListQuery, type RawListQuery } from '../../lib/query';
import type { CreateInviteInput, InviteListQuery, RedemptionListQuery } from './schema';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function hashCode(value: string): string {
  return crypto.createHmac('sha256', config.inviteCodeSecret).update(normalizeCode(value)).digest('hex');
}

function makeCode(): string {
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return `CF-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12).join('')}`;
}

function statusOf(row: { usedCount: number; maxUses: number; expiresAt: Date | null; revokedAt: Date | null }, now = new Date()): string {
  if (row.revokedAt) return 'REVOKED';
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (row.usedCount >= row.maxUses) return 'EXHAUSTED';
  return 'ACTIVE';
}

function publicInvite(row: any) {
  const status = statusOf(row);
  return {
    id: row.id,
    codePrefix: row.codePrefix,
    mode: row.mode,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    remainingUses: Math.max(0, row.maxUses - row.usedCount),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    note: row.note,
    status,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    createdBy: row.createdBy ? { id: row.createdBy.id, displayName: row.createdBy.displayName } : null,
  };
}

export async function create(input: CreateInviteInput, createdById?: string) {
  return prisma.$transaction(async (tx) => {
    const created: Array<{ code: string; invite: ReturnType<typeof publicInvite> }> = [];
    for (let i = 0; i < input.quantity; i += 1) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = makeCode();
        const row = await tx.inviteCode.create({
          data: {
            codeHash: hashCode(code),
            codePrefix: code.slice(0, 7),
            mode: input.mode,
            maxUses: input.maxUses,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            note: input.note || null,
            createdById: createdById || null,
          },
          include: { createdBy: { select: { id: true, displayName: true } } },
        });
        created.push({ code, invite: publicInvite(row) });
        break;
      }
    }
    return { items: created };
  }, { maxWait: 30_000, timeout: 30_000 });
}

export async function list(query: InviteListQuery & RawListQuery) {
  const built = buildListQuery(query, {
    keywordFields: ['codePrefix', 'note'],
    enumFilters: ['mode'],
    rangeFilters: { createdAt: ['createdFrom', 'createdTo'] },
    sortWhitelist: ['createdAt', 'lastUsedAt', 'usedCount', 'expiresAt'],
    defaultSort: { createdAt: 'desc' },
  });
  const now = new Date();
  const status = query.status;
  const base = built.where as Prisma.InviteCodeWhereInput;
  const rows = await prisma.inviteCode.findMany({
    where: base,
    orderBy: built.orderBy as Prisma.InviteCodeOrderByWithRelationInput,
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  const filtered = status ? rows.filter((row) => statusOf(row, now) === status) : rows;
  return { list: filtered.slice(built.skip, built.skip + built.take).map(publicInvite), total: filtered.length, page: built.page, pageSize: built.pageSize };
}

export async function detail(id: string) {
  const row = await prisma.inviteCode.findUnique({
    where: { id },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  if (!row) throw AppError.notFound('邀请码不存在');
  return publicInvite(row);
}

export async function redemptions(id: string, query: RedemptionListQuery & RawListQuery) {
  const invite = await prisma.inviteCode.findUnique({ where: { id }, select: { id: true } });
  if (!invite) throw AppError.notFound('邀请码不存在');
  const built = buildListQuery(query, { sortWhitelist: ['registeredAt'], defaultSort: { registeredAt: 'desc' } });
  const where = { ...built.where, inviteCodeId: id } as Prisma.InviteCodeRedemptionWhereInput;
  const [rows, total] = await prisma.$transaction([
    prisma.inviteCodeRedemption.findMany({
      where,
      orderBy: built.orderBy as Prisma.InviteCodeRedemptionOrderByWithRelationInput,
      skip: built.skip,
      take: built.take,
      include: { user: { select: { id: true, username: true, displayName: true } } },
    }),
    prisma.inviteCodeRedemption.count({ where }),
  ]);
  return { list: rows, total, page: built.page, pageSize: built.pageSize };
}

export async function revoke(id: string) {
  const row = await prisma.inviteCode.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('邀请码不存在');
  if (row.revokedAt) return publicInvite(row);
  const updated = await prisma.inviteCode.update({
    where: { id },
    data: { revokedAt: new Date() },
    include: { createdBy: { select: { id: true, displayName: true } } },
  });
  return publicInvite(updated);
}

export async function redeem(tx: Prisma.TransactionClient, code: string, userId: string, meta: { ip?: string; userAgent?: string; deviceId?: string; channel?: string }) {
  const row = await tx.inviteCode.findUnique({ where: { codeHash: hashCode(code) } });
  if (!row) throw new AppError(42211, '邀请码无效', 422);
  const status = statusOf(row);
  if (status === 'REVOKED') throw new AppError(42213, '邀请码已撤销', 422);
  if (status === 'EXPIRED') throw new AppError(42212, '邀请码已过期', 422);
  if (status === 'EXHAUSTED') throw new AppError(40913, '邀请码已达到使用次数上限', 409);
  const updated = await tx.inviteCode.updateMany({
    where: { id: row.id, revokedAt: null, usedCount: { lt: row.maxUses }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  if (updated.count !== 1) throw new AppError(40914, '邀请码正在被使用，请重试', 409);
  await tx.inviteCodeRedemption.create({
    data: { inviteCodeId: row.id, userId, ip: meta.ip || null, userAgent: meta.userAgent?.slice(0, 500) || null, deviceId: meta.deviceId || null, channel: meta.channel || 'WEB' },
  });
  return row.id;
}

import type { FastifyReply } from 'fastify';
import { AdminRole, AuditAction, AuditModule, AuditResult } from '../../lib/enums';
import { prisma } from '../../lib/prisma';
import { AppError, ErrorCode } from '../../lib/errors';
import { verifyPassword } from '../../lib/hash';
import { clientIp } from '../../lib/logger';
import { writeAudit } from '../../plugins/audit';
import { permissionsOf } from '../../plugins/auth';
import type { LoginInput, UpdateMeInput } from './schema';

const MAX_FAIL = 5;
const LOCK_MINUTES = 10;

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
    permissions: string[];
  };
}

export async function login(
  input: LoginInput,
  meta: { ip?: string; userAgent?: string; requestId?: string },
  signToken: (payload: { sub: string; role: AdminRole; username: string }) => string,
): Promise<LoginResult> {
  const user = await prisma.adminUser.findUnique({ where: { username: input.username } });

  if (!user) {
    await writeAudit({
      module: AuditModule.AUTH,
      action: AuditAction.LOGIN_FAIL,
      targetName: input.username,
      reason: '账号不存在',
      result: AuditResult.FAIL,
      ...meta,
    });
    throw new AppError(ErrorCode.BAD_CREDENTIALS, '用户名或密码错误', 401);
  }

  // ---- 锁定检查 ----
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(ErrorCode.ACCOUNT_LOCKED, `账号已锁定，请 ${mins} 分钟后重试`, 403);
  }
  if (user.status === 'DISABLED') {
    throw new AppError(ErrorCode.ACCOUNT_DISABLED, '账号已被禁用，请联系管理员', 403);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const failCount = user.failCount + 1;
    const shouldLock = failCount >= MAX_FAIL;
    await prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failCount: shouldLock ? 0 : failCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await writeAudit({
      operatorId: user.id,
      operatorName: user.displayName,
      module: AuditModule.AUTH,
      action: AuditAction.LOGIN_FAIL,
      targetName: input.username,
      reason: shouldLock ? `连续失败 ${MAX_FAIL} 次，账号锁定 ${LOCK_MINUTES} 分钟` : `密码错误（第 ${failCount} 次）`,
      result: AuditResult.FAIL,
      ...meta,
    });
    throw new AppError(
      ErrorCode.BAD_CREDENTIALS,
      shouldLock ? `密码错误 ${MAX_FAIL} 次，账号已锁定 ${LOCK_MINUTES} 分钟` : '用户名或密码错误',
      401,
    );
  }

  // ---- 成功 ----
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { failCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: meta.ip ?? null },
  });
  await writeAudit({
    operatorId: user.id,
    operatorName: user.displayName,
    module: AuditModule.AUTH,
    action: AuditAction.LOGIN,
    targetName: input.username,
    result: AuditResult.SUCCESS,
    ...meta,
  });

  const expiresInSec = 7 * 24 * 3600;
  const token = signToken({ sub: user.id, role: user.role as AdminRole, username: user.username });

  return {
    token,
    expiresIn: expiresInSec,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role as AdminRole,
      permissions: permissionsOf(user.role as AdminRole),
    },
  };
}

export async function logout(reply: FastifyReply, userId?: string): Promise<void> {
  if (userId) {
    const u = await prisma.adminUser.findUnique({ where: { id: userId } });
    await writeAudit({
      operatorId: userId,
      operatorName: u?.displayName ?? 'unknown',
      module: AuditModule.AUTH,
      action: AuditAction.LOGOUT,
      ip: clientIp(reply.request.headers as Record<string, unknown>),
      userAgent: String(reply.request.headers['user-agent'] ?? '').slice(0, 500),
      requestId: reply.request.id,
    });
  }
}

export async function me(userId: string) {
  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      email: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw AppError.notFound('账号不存在');
  return { ...user, permissions: permissionsOf(user.role as AdminRole) };
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  const found = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!found) throw AppError.notFound('账号不存在');
  const updated = await prisma.adminUser.update({
    where: { id: userId },
    data: { displayName: input.displayName, ...(input.email !== undefined ? { email: input.email || null } : {}) },
    select: { id: true, username: true, displayName: true, role: true, status: true, email: true, lastLoginAt: true, createdAt: true },
  });
  return { ...updated, permissions: permissionsOf(updated.role as AdminRole) };
}

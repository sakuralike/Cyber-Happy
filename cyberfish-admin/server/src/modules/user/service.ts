import { prisma } from '../../lib/prisma';
import { AppError, ErrorCode } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/hash';
import type { FeedbackInput, FeedbackListQuery, LoginInput, RegisterInput, UpdateMeInput } from './schema';

type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function sessionResult(user: UserRecord, signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string) {
  return {
    token: signToken({ sub: user.id, username: user.username, kind: 'APP_USER' }),
    expiresIn: 7 * 24 * 3600,
    user: publicUser(user),
  };
}

export async function register(
  input: RegisterInput,
  signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string,
) {
  const existing = await prisma.userAccount.findUnique({ where: { username: input.username } });
  if (existing) throw AppError.conflict('用户名已被使用');

  const user = await prisma.userAccount.create({
    data: {
      username: input.username,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName || input.username,
      email: input.email || null,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return sessionResult(user, signToken);
}

export async function login(
  input: LoginInput,
  signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string,
) {
  const user = await prisma.userAccount.findUnique({ where: { username: input.username } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(ErrorCode.BAD_CREDENTIALS, '用户名或密码错误', 401);
  }
  if (user.status === 'DISABLED') {
    throw new AppError(ErrorCode.ACCOUNT_DISABLED, '账号已被禁用，请联系管理员', 403);
  }

  const updated = await prisma.userAccount.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return sessionResult(updated, signToken);
}

export async function me(userId: string) {
  const user = await prisma.userAccount.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) throw AppError.notFound('账号不存在');
  return publicUser(user);
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  const user = await prisma.userAccount.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      ...(input.email !== undefined ? { email: input.email || null } : {}),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return publicUser(user);
}

export async function listMisreports(userId: string, query: FeedbackListQuery) {
  const [list, total] = await prisma.$transaction([
    prisma.misreport.findMany({
      where: { userId },
      select: {
        id: true,
        reportNo: true,
        reportType: true,
        status: true,
        userNote: true,
        reportedAt: true,
        resolution: true,
        reviewerNote: true,
      },
      orderBy: { reportedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.misreport.count({ where: { userId } }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

export async function createFeedback(userId: string, input: FeedbackInput) {
  return prisma.userFeedback.create({
    data: { userId, content: input.content, contact: input.contact || null },
    select: { id: true, content: true, contact: true, status: true, createdAt: true, updatedAt: true },
  });
}

export async function listFeedback(userId: string, query: FeedbackListQuery) {
  const [list, total] = await prisma.$transaction([
    prisma.userFeedback.findMany({
      where: { userId },
      select: { id: true, content: true, contact: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.userFeedback.count({ where: { userId } }),
  ]);
  return { list, total, page: query.page, pageSize: query.pageSize };
}

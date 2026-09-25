import { prisma } from '../../lib/prisma';
import { AppError, ErrorCode } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/hash';
import { ConfigScope } from '../../lib/enums';
import * as settingsService from '../system-settings/service';
import * as inviteService from '../invite/service';
import type {
  ChangePasswordInput,
  FeedbackInput,
  FeedbackListQuery,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  UpdateMeInput,
} from './schema';

type UserRecord = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarFileId: string | null;
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
    avatarUrl: user.avatarFileId ? `/api/v1/public/assets/${user.avatarFileId}` : null,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function sessionResult(user: UserRecord, signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string) {
  return {
    token: signToken({ sub: user.id, username: user.username, kind: 'APP_USER' }),
    expiresIn: 30 * 24 * 3600,
    user: publicUser(user),
  };
}

export async function register(
  input: RegisterInput,
  signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string,
  meta: { ip?: string; userAgent?: string; deviceId?: string; channel?: string } = {},
) {
  const policy = await authPolicy();
  if (!policy.registrationEnabled) throw new AppError(ErrorCode.AUTH_REGISTRATION_DISABLED, policy.registrationDisabledMessage, 403);
  if (policy.inviteRequired && !input.inviteCode) throw new AppError(ErrorCode.INVITE_REQUIRED, policy.inviteRequiredMessage, 422);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.userAccount.findUnique({ where: { username: input.username } });
    if (existing) throw AppError.conflict('用户名已被使用');
    const created = await tx.userAccount.create({
      data: {
        username: input.username,
        passwordHash,
        displayName: input.displayName || input.username,
        email: input.email || null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatarFileId: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (policy.inviteRequired) await inviteService.redeem(tx, input.inviteCode!, created.id, meta);
    return created;
  }, { maxWait: 30_000, timeout: 30_000 });
  return sessionResult(user, signToken);
}

export async function login(
  input: LoginInput,
  signToken: (payload: { sub: string; username: string; kind: 'APP_USER' }) => string,
) {
  const policy = await authPolicy();
  if (!policy.loginEnabled) throw new AppError(ErrorCode.AUTH_LOGIN_DISABLED, policy.loginDisabledMessage, 403);
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
      avatarFileId: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return sessionResult(updated, signToken);
}

async function authPolicy() {
  await settingsService.ensureDefaults();
  const result = await settingsService.publicConfig(ConfigScope.USER_PAGE);
  const data = ('data' in result ? result.data : {}) as Record<string, unknown>;
  return {
    loginEnabled: data['auth.loginEnabled'] !== false,
    registrationEnabled: data['auth.registrationEnabled'] !== false,
    inviteRequired: data['auth.inviteRequired'] === true,
    loginDisabledMessage: String(data['auth.loginDisabledMessage'] || '用户登录暂未开放，请稍后再试'),
    registrationDisabledMessage: String(data['auth.registrationDisabledMessage'] || '用户注册暂未开放，请联系管理员'),
    inviteRequiredMessage: String(data['auth.inviteRequiredMessage'] || '当前注册需要邀请码'),
  };
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.userAccount.findUnique({ where: { username: input.username } });
  if (!user || !user.email || user.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new AppError(ErrorCode.BAD_CREDENTIALS, '用户名或邮箱不匹配', 401);
  }
  if (user.status === 'DISABLED') {
    throw new AppError(ErrorCode.ACCOUNT_DISABLED, '账号已被禁用，请联系管理员', 403);
  }
  await prisma.userAccount.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  return { reset: true };
}

export async function me(userId: string) {
  const user = await prisma.userAccount.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarFileId: true,
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
      avatarFileId: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return publicUser(user);
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.userAccount.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('账号不存在');
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(ErrorCode.BAD_CREDENTIALS, '当前密码错误', 401);
  }
  await prisma.userAccount.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  return { changed: true };
}

export async function updateAvatar(userId: string, fileId: string) {
  const file = await prisma.fileAsset.findUnique({
    where: { id: fileId },
    select: { id: true, bizType: true },
  });
  if (!file) throw AppError.notFound('头像文件不存在');
  if (file.bizType !== 'IMAGE') throw AppError.badRequest('头像必须使用图片文件');
  const user = await prisma.userAccount.update({
    where: { id: userId },
    data: { avatarFileId: file.id },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarFileId: true,
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

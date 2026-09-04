import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AdminRole } from '../lib/enums';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { config } from '../config';
import type { CurrentUser } from '../types/fastify';

/** 角色 → 权限点映射 */
const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  ADMIN: [
    'appVersion:read', 'appVersion:write', 'appVersion:publish', 'appVersion:delete',
    'model:read', 'model:write', 'model:dispatch', 'model:rollback',
    'misreport:read', 'misreport:review', 'misreport:assign', 'misreport:export',
    'dashboard:read', 'auditLog:read', 'admin:read', 'admin:write', 'siteConfig:write', 'file:read', 'file:upload',
  ],
  OPERATOR: [
    'appVersion:read', 'appVersion:write', 'appVersion:publish',
    'model:read', 'model:write', 'model:dispatch',
    'misreport:read', 'misreport:review', 'misreport:assign', 'misreport:export',
    'dashboard:read', 'auditLog:read', 'file:read', 'file:upload',
  ],
  REVIEWER: ['appVersion:read', 'model:read', 'misreport:read', 'misreport:review', 'dashboard:read', 'file:read'],
  VIEWER: ['appVersion:read', 'model:read', 'misreport:read', 'dashboard:read', 'file:read'],
};

export function permissionsOf(role: AdminRole): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** 无需登录的公开路径 */
const PUBLIC_PATHS = [
  '/health',
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/site-config',
  '/api/v1/site-config/apk',
];

function isPublic(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return PUBLIC_PATHS.includes(path);
}

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(import('@fastify/jwt'), {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  app.decorate('authenticate', async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      throw AppError.unauthorized('登录已过期，请重新登录');
    }
    const payload = request.user as { sub?: string };
    if (!payload?.sub) throw AppError.unauthorized();

    const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!user) throw AppError.unauthorized('账号不存在');
    if (user.status === 'DISABLED') {
      throw new AppError(40301, '账号已被禁用，请联系管理员', 403);
    }

    const current: CurrentUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role as AdminRole,
    };
    request.currentUser = current;
  });

  app.decorate('requireRole', (...roles: AdminRole[]) => {
    return async function (request: FastifyRequest) {
      if (!request.currentUser) throw AppError.unauthorized();
      if (!roles.includes(request.currentUser.role)) {
        throw AppError.forbidden(`该操作需要以下角色之一：${roles.join(' / ')}`);
      }
    };
  });

  app.decorate('requirePermission', (perm: string) => {
    return async function (request: FastifyRequest) {
      if (!request.currentUser) throw AppError.unauthorized();
      const granted = permissionsOf(request.currentUser.role);
      if (!granted.includes(perm)) throw AppError.forbidden(`缺少权限：${perm}`);
    };
  });

  // 全局钩子：非公开路径一律要求登录
  app.addHook('onRequest', async (request) => {
    if (isPublic(request.url)) return;
    // APP 端接口走 X-App-Token，跳过后台 JWT
    const appToken = request.headers['x-app-token'];
    if (typeof appToken === 'string' && appToken === config.appApiToken) {
      (request as FastifyRequest & { isAppClient?: boolean }).isAppClient = true;
      return;
    }
    await app.authenticate(request, null as unknown as FastifyReply);
  });
};

export default fp(authPlugin, { name: 'auth-plugin' });
export { ROLE_PERMISSIONS };

import type { AdminUser } from '@prisma/client';
import type { AdminRole } from '../lib/enums';
import type { CurrentDevice } from '../modules/device-auth/service';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
}

export interface CurrentAppUser {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: CurrentUser;
    currentAppUser?: CurrentAppUser;
    currentDevice?: CurrentDevice;
    isAppClient?: boolean;
    checkInAuditHandled?: boolean;
    /** 业务 Handler 注入的审计补充信息 */
    auditExtra?: {
      module?: string;
      action?: string;
      targetType?: string;
      targetId?: string;
      targetName?: string;
      before?: unknown;
      after?: unknown;
      reason?: string;
    };
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    resolveAppUser: (request: FastifyRequest) => Promise<CurrentAppUser | undefined>;
    requireRole: (...roles: AdminRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (perm: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      role?: AdminRole;
      username?: string;
      kind?: 'APP_USER' | 'DEVICE';
      deviceId?: string;
      keyId?: string;
      scopes?: string[];
      ver?: number;
      jti?: string;
      iat?: number;
      exp?: number;
    };
    user: {
      sub: string;
      role?: AdminRole;
      username?: string;
      kind?: 'APP_USER' | 'DEVICE';
      deviceId?: string;
      keyId?: string;
      scopes?: string[];
      ver?: number;
      jti?: string;
      iat?: number;
      exp?: number;
    };
  }
}

export type { AdminUser };

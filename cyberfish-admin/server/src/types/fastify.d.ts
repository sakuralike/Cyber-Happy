import type { AdminUser } from '@prisma/client';
import type { AdminRole } from '../lib/enums';

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: CurrentUser;
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
    requireRole: (...roles: AdminRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (perm: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: AdminRole; username: string };
    user: { sub: string; role: AdminRole; username: string };
  }
}

export type { AdminUser };

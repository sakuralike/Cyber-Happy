import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AuditAction, AuditModule, AuditResult } from '../lib/enums';
import { prisma } from '../lib/prisma';
import { logger, clientIp } from '../lib/logger';
import { toJsonString } from '../lib/serialize';

export interface WriteAuditInput {
  operatorId?: string | null;
  operatorName?: string;
  module: AuditModule;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  result?: AuditResult;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** before/after 超过 8KB 截断，防止日志表膨胀 */
function trimPayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = toJsonString(value);
  if (s.length > 8192) {
    return `${s.slice(0, 8192)}...[truncated]`;
  }
  return s;
}

export async function writeAudit(input: WriteAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        operatorId: input.operatorId ?? null,
        operatorName: input.operatorName ?? 'system',
        module: input.module,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetName: input.targetName ?? null,
        before: trimPayload(input.before),
        after: trimPayload(input.after),
        reason: input.reason ?? null,
        result: input.result ?? AuditResult.SUCCESS,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (err) {
    // 审计失败不能阻断业务，但必须打日志
    logger.error({ err }, '[audit] 写入操作日志失败');
  }
}

/** 从 URL 推断模块 */
function moduleFromUrl(url: string): AuditModule | null {
  const p = url.split('?')[0] ?? '';
  if (p.includes('/auth/')) return AuditModule.AUTH;
  if (p.includes('/admins')) return AuditModule.ADMIN;
  if (p.includes('/files')) return AuditModule.FILE;
  if (p.includes('/app-versions')) return AuditModule.APP_VERSION;
  if (p.includes('/models')) return AuditModule.MODEL;
  if (p.includes('/misreports')) return AuditModule.MISREPORT;
  if (p.includes('/dashboard')) return AuditModule.DASHBOARD;
  return null;
}

/** 从方法与路径推断动作 */
function actionFromMethod(method: string, url: string): AuditAction | null {
  const p = url.split('?')[0] ?? '';
  if (p.endsWith('/login')) return AuditAction.LOGIN;
  if (p.endsWith('/logout')) return AuditAction.LOGOUT;
  if (p.includes('/actions')) {
    if (p.includes('publish-gray')) return AuditAction.PUBLISH_GRAY;
    if (p.includes('publish-online')) return AuditAction.PUBLISH_ONLINE;
    if (p.includes('offline')) return AuditAction.OFFLINE;
    if (p.includes('rollback')) return AuditAction.ROLLBACK;
    return AuditAction.PUBLISH;
  }
  if (p.endsWith('/dispatch')) return AuditAction.DISPATCH;
  if (p.endsWith('/rollback')) return AuditAction.ROLLBACK;
  if (p.endsWith('/retry')) return AuditAction.RETRY;
  if (p.endsWith('/review')) return AuditAction.REVIEW;
  if (p.endsWith('/assign')) return AuditAction.ASSIGN;
  if (p.endsWith('/batch')) return AuditAction.BATCH_REVIEW;
  if (p.endsWith('/export')) return AuditAction.EXPORT;
  if (p.endsWith('/upload')) return AuditAction.UPLOAD;

  switch (method) {
    case 'POST':
      return AuditAction.CREATE;
    case 'PATCH':
    case 'PUT':
      return AuditAction.UPDATE;
    case 'DELETE':
      return AuditAction.DELETE;
    default:
      return null;
  }
}

/** 不记录审计的路径 */
const SKIP_AUDIT = ['/health', '/api/v1/health', '/api/v1/auth/me', '/api/v1/audit-logs', '/files/'];

/**
 * 自动操作日志：
 * 拦截所有写操作（POST/PATCH/PUT/DELETE），记录 module/action/result/ip/ua。
 * 业务 Handler 可通过 request.auditExtra 补充语义化信息（targetName / before / after / reason）。
 */
const auditPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onSend', async (request, reply, payload) => {
    const method = request.method;
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return payload;

    const url = request.url.split('?')[0] ?? '';
    if (SKIP_AUDIT.some((p) => url.startsWith(p))) return payload;
    if (request.headers['x-app-token']) return payload; // APP 端调用不记后台审计

    const module = moduleFromUrl(url);
    const action = actionFromMethod(method, url);
    if (!module || !action) return payload;

    let parsed: { code?: number } = {};
    try {
      parsed = typeof payload === 'string' ? JSON.parse(payload) : (payload as { code?: number });
    } catch {
      /* 忽略非 JSON 响应 */
    }
    const success = reply.statusCode < 400 && (parsed.code === undefined || parsed.code === 0);

    const extra = request.auditExtra;
    await writeAudit({
      operatorId: request.currentUser?.id ?? null,
      operatorName: request.currentUser?.displayName ?? 'system',
      module,
      action: (extra?.action as AuditAction) ?? action,
      targetType: extra?.targetType,
      targetId: extra?.targetId ?? (request.params as Record<string, string> | undefined)?.id,
      targetName: extra?.targetName,
      before: extra?.before,
      after: extra?.after,
      reason: extra?.reason,
      result: success ? AuditResult.SUCCESS : AuditResult.FAIL,
      ip: clientIp(request.headers as Record<string, unknown>),
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 500),
      requestId: request.id,
    });

    return payload;
  });
};

export default fp(auditPlugin, { name: 'audit-plugin' });

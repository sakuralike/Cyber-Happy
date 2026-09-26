import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow, idParamSchema } from '../../lib/zod';
import { sendCreated, sendOk, sendPage } from '../../lib/response';
import { createInviteSchema, inviteIdSchema, inviteListSchema, redemptionListSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const read = app.requirePermission('inviteCode:read');
  const write = app.requirePermission('inviteCode:write');
  const revoke = app.requirePermission('inviteCode:revoke');

  app.get('/', { onRequest: [app.authenticate, read] }, async (request, reply) => {
    const result = await service.list(parseOrThrow(inviteListSchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });
  app.post('/', { onRequest: [app.authenticate, write] }, async (request, reply) => {
    const result = await service.create(parseOrThrow(createInviteSchema, request.body), request.currentUser?.id);
    request.auditExtra = { targetType: 'InviteCode', targetName: '批量生成邀请码', after: { count: result.items.length, items: result.items.map((item) => ({ id: item.invite.id, codePrefix: item.invite.codePrefix, mode: item.invite.mode, maxUses: item.invite.maxUses, expiresAt: item.invite.expiresAt })) } };
    return sendCreated(reply, result);
  });
  app.get('/:id', { onRequest: [app.authenticate, read] }, async (request, reply) => sendOk(reply, await service.detail(parseOrThrow(inviteIdSchema, request.params).id)));
  app.get('/:id/redemptions', { onRequest: [app.authenticate, read] }, async (request, reply) => {
    const id = parseOrThrow(inviteIdSchema, request.params).id;
    const result = await service.redemptions(id, parseOrThrow(redemptionListSchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });
  app.post('/:id/revoke', { onRequest: [app.authenticate, revoke] }, async (request, reply) => {
    const id = parseOrThrow(inviteIdSchema, request.params).id;
    const result = await service.revoke(id);
    request.auditExtra = { targetType: 'InviteCode', targetId: id, targetName: result.codePrefix, after: { revokedAt: result.revokedAt } };
    return sendOk(reply, result);
  });
};

export default routes;

import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk, sendPage } from '../../lib/response';
import { checkInBodySchema, checkInStatsQuerySchema, historySchema, riskEventQuerySchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/check-in/overview', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.overview(request.currentAppUser!.id)),
  );

  app.post('/check-in', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.checkIn(
      request.currentAppUser!.id,
      parseOrThrow(checkInBodySchema, request.body ?? {}),
      request.ip,
    )),
  );

  app.get('/check-in/history', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const result = await service.history(request.currentAppUser!.id, parseOrThrow(historySchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });

  app.get('/admin/check-in/risk-events', { onRequest: [app.authenticate, app.requirePermission('siteConfig:read')] }, async (request, reply) => {
    const result = await service.riskEvents(parseOrThrow(riskEventQuerySchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });

  app.get('/admin/check-in/stats', { onRequest: [app.authenticate, app.requirePermission('siteConfig:read')] }, async (request, reply) =>
    sendOk(reply, await service.stats(parseOrThrow(checkInStatsQuerySchema, request.query))),
  );
};

export default routes;

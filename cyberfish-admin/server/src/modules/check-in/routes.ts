import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { parseOrThrow } from '../../lib/zod';
import { sendOk, sendPage } from '../../lib/response';
import { checkInBodySchema, checkInStatsQuerySchema, historySchema, riskEventQuerySchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/check-in/overview', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.overview(request.currentAppUser!.id)),
  );

  app.post('/check-in', {
    preValidation: [
      async (request) => {
        if (request.headers['x-app-token'] !== config.appApiToken) throw AppError.unauthorized();
      },
      app.authenticateUser,
    ],
  }, async (request, reply) => {
    const body = parseOrThrow(checkInBodySchema, request.body ?? {});
    try {
      const result = await service.checkIn(
        request.currentAppUser!.id,
        body,
        {
          ip: request.ip,
          userAgent: String(request.headers['user-agent'] ?? '').slice(0, 500),
          requestId: request.id,
        },
      );
      request.checkInAuditHandled = true;
      return sendOk(reply, result);
    } catch (error) {
      request.checkInAuditHandled = true;
      throw error;
    }
  });

  app.get('/check-in/history', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const result = await service.history(request.currentAppUser!.id, parseOrThrow(historySchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });

  app.get('/admin/check-in/risk-events', { onRequest: [app.authenticate, app.requirePermission('checkInRisk:read')] }, async (request, reply) => {
    const result = await service.riskEvents(parseOrThrow(riskEventQuerySchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });

  app.get('/admin/check-in/stats', { onRequest: [app.authenticate, app.requirePermission('checkInRisk:read')] }, async (request, reply) =>
    sendOk(reply, await service.stats(parseOrThrow(checkInStatsQuerySchema, request.query))),
  );
};

export default routes;

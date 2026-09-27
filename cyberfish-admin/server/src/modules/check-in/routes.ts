import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk, sendPage } from '../../lib/response';
import { checkInBodySchema, checkInStatsQuerySchema, historySchema, riskEventQuerySchema } from './schema';
import * as service from './service';
import { assertDeviceId, requireDeviceAuth } from '../device-auth/guard';

const routes: FastifyPluginAsync = async (app) => {
  const deviceGuard = requireDeviceAuth(app, 'event:write');
  app.get('/check-in/overview', { onRequest: [app.authenticateUser], preValidation: [deviceGuard] }, async (request, reply) =>
    sendOk(reply, await service.overview(request.currentAppUser!.id)),
  );

  app.post('/check-in', {
    preValidation: [deviceGuard, app.authenticateUser],
  }, async (request, reply) => {
    const body = parseOrThrow(checkInBodySchema, request.body ?? {});
    assertDeviceId(request, body.deviceId);
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

  app.get('/check-in/history', { onRequest: [app.authenticateUser], preValidation: [deviceGuard] }, async (request, reply) => {
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

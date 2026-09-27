import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk } from '../../lib/response';
import { dashboardQuerySchema, metricBackfillSchema } from './schema';
import * as service from './service';
import { backfillDailyMetrics } from '../../jobs/daily-metrics';

const routes: FastifyPluginAsync = async (app) => {
  const guard = app.requirePermission('dashboard:read');
  const writeGuard = app.requirePermission('dashboard:write');

  app.post('/metrics/backfill', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const input = parseOrThrow(metricBackfillSchema, request.body);
    const result = await backfillDailyMetrics(input.from, input.to);
    request.auditExtra = {
      module: 'DASHBOARD',
      action: 'UPDATE',
      targetType: 'DailyMetric',
      targetName: `${input.from} ~ ${input.to}`,
      after: result,
    };
    return sendOk(reply, result);
  });

  app.get('/overview', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.overview(q));
  });

  app.get('/trend', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.trend(q));
  });

  app.get('/version-distribution', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.versionDistribution(q));
  });

  app.get('/model-usage', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.modelUsage(q));
  });

  app.get('/misreport-analysis', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.misreportAnalysis(q));
  });

  app.get('/health', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(dashboardQuerySchema, request.query);
    return sendOk(reply, await service.health(q));
  });
};

export default routes;

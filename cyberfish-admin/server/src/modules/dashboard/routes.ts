import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk } from '../../lib/response';
import { dashboardQuerySchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const guard = app.requirePermission('dashboard:read');

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

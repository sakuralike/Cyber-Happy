import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk, sendPage } from '../../lib/response';
import { historySchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/check-in/overview', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.overview(request.currentAppUser!.id)),
  );

  app.post('/check-in', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.checkIn(request.currentAppUser!.id)),
  );

  app.get('/check-in/history', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const result = await service.history(request.currentAppUser!.id, parseOrThrow(historySchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });
};

export default routes;

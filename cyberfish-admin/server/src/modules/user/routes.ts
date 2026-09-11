import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendCreated, sendOk, sendPage } from '../../lib/response';
import { feedbackListSchema, feedbackSchema, loginSchema, registerSchema, updateMeSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await service.register(parseOrThrow(registerSchema, request.body), (payload) => app.jwt.sign(payload));
    return sendCreated(reply, data);
  });

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await service.login(parseOrThrow(loginSchema, request.body), (payload) => app.jwt.sign(payload));
    return sendOk(reply, data);
  });

  app.get('/me', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.me(request.currentAppUser!.id)),
  );

  app.patch('/me', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.updateMe(request.currentAppUser!.id, parseOrThrow(updateMeSchema, request.body))),
  );

  app.get('/misreports', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const result = await service.listMisreports(request.currentAppUser!.id, parseOrThrow(feedbackListSchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });

  app.post('/feedback', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendCreated(reply, await service.createFeedback(request.currentAppUser!.id, parseOrThrow(feedbackSchema, request.body))),
  );

  app.get('/feedback', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const result = await service.listFeedback(request.currentAppUser!.id, parseOrThrow(feedbackListSchema, request.query));
    return sendPage(reply, result.list, result.total, result.page, result.pageSize);
  });
};

export default routes;

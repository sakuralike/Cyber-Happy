import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendCreated, sendOk, sendPage } from '../../lib/response';
import { FileBizType } from '../../lib/enums';
import { AppError } from '../../lib/errors';
import * as fileService from '../file/service';
import {
  changePasswordSchema,
  feedbackListSchema,
  feedbackSchema,
  loginSchema,
  registerSchema,
  updateMeSchema,
} from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await service.register(parseOrThrow(registerSchema, request.body), (payload) => app.jwt.sign(payload, { expiresIn: '30d' }));
    return sendCreated(reply, data);
  });

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await service.login(parseOrThrow(loginSchema, request.body), (payload) => app.jwt.sign(payload, { expiresIn: '30d' }));
    return sendOk(reply, data);
  });

  app.get('/me', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.me(request.currentAppUser!.id)),
  );

  app.patch('/me', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.updateMe(request.currentAppUser!.id, parseOrThrow(updateMeSchema, request.body))),
  );

  app.patch('/me/password', { onRequest: [app.authenticateUser] }, async (request, reply) =>
    sendOk(reply, await service.changePassword(request.currentAppUser!.id, parseOrThrow(changePasswordSchema, request.body))),
  );

  app.post('/me/avatar', { onRequest: [app.authenticateUser] }, async (request, reply) => {
    const parts = request.parts();
    let result: Awaited<ReturnType<typeof fileService.upload>> | null = null;
    for await (const part of parts) {
      if (part.type !== 'file' || part.fieldname !== 'file') continue;
      if (result) throw AppError.badRequest('只能上传一个头像文件');
      result = await fileService.upload(part.file, FileBizType.IMAGE, part.filename || 'avatar.jpg', part.mimetype);
    }
    if (!result) throw AppError.badRequest('缺少文件字段 file');
    return sendOk(reply, await service.updateAvatar(request.currentAppUser!.id, result.id));
  });

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

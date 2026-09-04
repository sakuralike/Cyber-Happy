import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import { parseOrThrow } from '../../lib/zod';
import { sendOk } from '../../lib/response';
import { AppError } from '../../lib/errors';
import { updateSiteConfigSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const writeGuard = app.requirePermission('siteConfig:write');

  app.get('/', async (_request, reply) => sendOk(reply, await service.get()));

  app.patch('/', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const input = parseOrThrow(updateSiteConfigSchema, request.body);
    const result = await service.update(input, request.currentUser?.id);
    request.auditExtra = {
      targetType: 'SiteConfig',
      targetId: 'default',
      targetName: '首页配置',
      after: { title: result.title, apkUrl: result.apkUrl },
    };
    return sendOk(reply, result);
  });

  app.get('/apk', async (_request, reply) => {
    const file = await service.openApk();
    if (!file) throw AppError.notFound('首页尚未配置 APK');
    reply
      .header('Content-Type', file.mimeType)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    return reply.send(fs.createReadStream(file.full));
  });
};

export default routes;

import Fastify, { type FastifyInstance, type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { logger } from './lib/logger';
import { jsonReplacer } from './lib/serialize';
import authPlugin from './plugins/auth';
import auditPlugin from './plugins/audit';
import errorHandlerPlugin from './plugins/error-handler';

import authRoutes from './modules/auth/routes';
import adminRoutes from './modules/admin/routes';
import fileRoutes from './modules/file/routes';
import appVersionRoutes from './modules/app-version/routes';
import modelRoutes from './modules/model/routes';
import misreportRoutes from './modules/misreport/routes';
import dashboardRoutes from './modules/dashboard/routes';
import auditLogRoutes from './modules/audit-log/routes';
import siteConfigRoutes from './modules/site-config/routes';
import appEventRoutes from './modules/app-event/routes';
import systemSettingsRoutes from './modules/system-settings/routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // pino({transport}) 推断类型含 LoggerExtras，与 Fastify 的 FastifyBaseLogger 不一致，显式收窄
    logger: logger as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: config.maxUploadSize,
    // BigInt 安全序列化
    jsonShorthand: true,
  });

  app.setSerializerCompiler(() => (data: unknown) => JSON.stringify(data, jsonReplacer));

  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSize,
      files: 5,
      fields: 20,
    },
  });

  // 错误兜底与鉴权、审计插件
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(auditPlugin);

  // 静态文件服务（上传的资源）
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    prefix: '/files/',
    decorateReply: false,
  });

  // 健康检查
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));
  app.get('/api/v1/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // 业务路由
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(adminRoutes, { prefix: '/admins' });
      await v1.register(fileRoutes, { prefix: '/files' });
      await v1.register(appVersionRoutes, { prefix: '/app-versions' });
      await v1.register(modelRoutes, { prefix: '/models' });
      await v1.register(misreportRoutes, { prefix: '/misreports' });
      await v1.register(dashboardRoutes, { prefix: '/dashboard' });
      await v1.register(auditLogRoutes, { prefix: '/audit-logs' });
      await v1.register(siteConfigRoutes, { prefix: '/site-config' });
      await v1.register(appEventRoutes, { prefix: '/app-events' });
      await v1.register(systemSettingsRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

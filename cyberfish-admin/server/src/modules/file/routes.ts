import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import { parseOrThrow } from '../../lib/zod';
import { sendOk, sendCreated } from '../../lib/response';
import { AppError } from '../../lib/errors';
import { uploadQuerySchema, fileIdParamSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const uploadPermission = app.requirePermission('file:upload');
  const readPermission = app.requirePermission('file:read');
  const uploadGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    const isAppClient = (request as FastifyRequest & { isAppClient?: boolean }).isAppClient;
    const bizType = String((request.query as Record<string, unknown> | undefined)?.bizType ?? '');
    if (isAppClient && ['IMAGE', 'VIDEO'].includes(bizType)) return;
    if (isAppClient) throw AppError.forbidden('APP 端仅允许上传误报媒体');
    return uploadPermission(request, reply);
  };
  const readGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    if ((request as FastifyRequest & { isAppClient?: boolean }).isAppClient) return;
    return readPermission(request, reply);
  };

  /** 统一文件上传：multipart/form-data，字段 bizType + file */
  app.post('/upload', { onRequest: [uploadGuard] }, async (request, reply) => {
    const { bizType } = parseOrThrow(uploadQuerySchema, request.query);

    const parts = request.parts();
    let handled = false;
    let result: Awaited<ReturnType<typeof service.upload>> | null = null;

    for await (const part of parts) {
      if (part.type !== 'file' || part.fieldname !== 'file') {
        // 忽略非文件字段（避免 fastify 抛未消费的流错误）
        if (part.type === 'field') continue;
        continue;
      }
      handled = true;
      result = await service.upload(
        part.file,
        bizType,
        part.filename || 'unknown',
        part.mimetype,
        request.currentUser?.id,
      );
    }

    if (!handled || !result) throw AppError.badRequest('缺少文件字段 file');

    request.auditExtra = {
      module: 'FILE',
      targetType: 'FileAsset',
      targetId: result.id,
      targetName: result.originalName,
      after: { bizType: result.bizType, size: result.size, sha256: result.sha256.slice(0, 16) },
    };
    return sendCreated(reply, result);
  });

  app.get('/:id', { onRequest: [readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(fileIdParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });

  /** 带鉴权的下载 */
  app.get('/:id/download', { onRequest: [readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(fileIdParamSchema, request.params);
    const asset = await service.detail(id);
    const full = service.resolvePath(asset.url);
    if (!full) throw AppError.notFound('文件已丢失');
    reply
      .header('Content-Type', asset.mimeType)
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      );
    return reply.send(fs.createReadStream(full));
  });
};

export default routes;

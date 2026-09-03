import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { fail } from '../lib/response';

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    // ---- 应用自定义错误 ----
    if (error instanceof AppError) {
      if (error.httpStatus >= 500) logger.error({ err: error, requestId }, error.message);
      else logger.warn({ code: error.code, requestId }, error.message);
      return reply
        .code(error.httpStatus)
        .send(fail(error.code, error.message, error.details ?? null, requestId));
    }

    // ---- Zod 参数校验错误 ----
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      logger.warn({ requestId, issues }, '参数校验失败');
      return reply.code(422).send(fail(42200, '参数校验失败', { issues }, requestId));
    }

    // ---- JWT ----
    const anyErr = error as { statusCode?: number; code?: string; message?: string };
    if (anyErr.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || anyErr.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.code(401).send(fail(40100, '未登录或登录已过期', null, requestId));
    }

    // ---- Fastify 校验错误 ----
    if (anyErr.code === 'FST_ERR_VALIDATION') {
      return reply.code(422).send(fail(42200, anyErr.message ?? '请求参数不合法', null, requestId));
    }
    if (anyErr.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.code(415).send(fail(42200, '不支持的 Content-Type', null, requestId));
    }

    // ---- 未知错误 ----
    logger.error({ err: error, requestId }, '未处理异常');
    const message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : (error.message ?? '服务器内部错误');
    return reply.code(500).send(fail(50000, message, null, requestId));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(fail(40400, `接口不存在：${request.method} ${request.url}`, null, request.id));
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler-plugin' });

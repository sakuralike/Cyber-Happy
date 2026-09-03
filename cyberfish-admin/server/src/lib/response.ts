import type { FastifyReply } from 'fastify';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

/** 成功 - 单个对象 */
export function ok<T>(data: T, requestId?: string): ApiEnvelope<T> {
  return { code: 0, message: 'ok', data, requestId };
}

/** 成功 - 分页列表 */
export function page<T>(
  list: T[],
  total: number,
  pageNum: number,
  pageSize: number,
  requestId?: string,
): ApiEnvelope<{ list: T[]; pagination: PaginationMeta }> {
  return {
    code: 0,
    message: 'ok',
    data: {
      list,
      pagination: {
        page: pageNum,
        pageSize,
        total,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    },
    requestId,
  };
}

/** 成功 - 无数据 */
export function okEmpty(requestId?: string): ApiEnvelope<null> {
  return { code: 0, message: 'ok', data: null, requestId };
}

/** 失败 */
export function fail(
  code: number,
  message: string,
  details?: unknown,
  requestId?: string,
): ApiEnvelope<unknown> {
  return { code, message, data: details ?? null, requestId };
}

export function sendOk<T>(reply: FastifyReply, data: T): FastifyReply {
  return reply.send(ok(data, reply.request.id));
}

export function sendPage<T>(
  reply: FastifyReply,
  list: T[],
  total: number,
  pageNum: number,
  pageSize: number,
): FastifyReply {
  return reply.send(page(list, total, pageNum, pageSize, reply.request.id));
}

export function sendCreated<T>(reply: FastifyReply, data: T): FastifyReply {
  return reply.code(201).send(ok(data, reply.request.id));
}

export function sendEmpty(reply: FastifyReply): FastifyReply {
  return reply.code(204).send();
}

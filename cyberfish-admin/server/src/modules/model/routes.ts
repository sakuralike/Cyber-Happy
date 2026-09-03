import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow, idParamSchema, listQuerySchema } from '../../lib/zod';
import { sendOk, sendCreated, sendPage } from '../../lib/response';
import {
  modelListSchema,
  createModelSchema,
  updateModelSchema,
  dispatchSchema,
  rollbackSchema,
  dispatchListSchema,
  deviceLogListSchema,
  checkModelSchema,
  reportDispatchSchema,
} from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const readGuard = app.requirePermission('model:read');
  const writeGuard = app.requirePermission('model:write');
  const dispatchGuard = app.requirePermission('model:dispatch');
  const rollbackGuard = app.requirePermission('model:rollback');

  // ---------------- 模型 CRUD ----------------

  app.get('/', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const q = parseOrThrow(modelListSchema, request.query);
    const { list, total, page, pageSize } = await service.list(q);
    return sendPage(reply, list, total, page, pageSize);
  });

  app.get('/:id', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });

  app.post('/', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const input = parseOrThrow(createModelSchema, request.body);
    const created = await service.create(input, request.currentUser?.id);
    request.auditExtra = {
      targetType: 'MlModel',
      targetId: created.id,
      targetName: created.modelVersion,
      after: { arch: created.arch, quant: created.quant, map50: created.map50, status: created.status },
    };
    return sendCreated(reply, created);
  });

  app.patch('/:id', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(updateModelSchema, request.body);
    const { before, after } = await service.update(id, input);
    request.auditExtra = {
      targetType: 'MlModel',
      targetId: id,
      targetName: before.modelVersion,
      before: { status: before.status, map50: before.map50, remark: before.remark },
      after: { status: after.status, map50: after.map50, remark: after.remark },
    };
    return sendOk(reply, after);
  });

  app.delete('/:id', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const removed = await service.remove(id);
    request.auditExtra = {
      targetType: 'MlModel',
      targetId: id,
      targetName: removed.modelVersion,
      before: { status: removed.status },
    };
    return sendOk(reply, { id, deleted: true });
  });

  // ---------------- 下发 ----------------

  app.post('/:id/dispatch', { onRequest: [app.authenticate, dispatchGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(dispatchSchema, request.body);
    const result = await service.dispatch(id, input, request.currentUser?.id);
    request.auditExtra = {
      action: 'DISPATCH',
      targetType: 'MlModel',
      targetId: id,
      targetName: String((result as { remark?: string }).remark ?? id),
      before: result.before,
      after: {
        dispatchId: result.id,
        targetType: result.targetType,
        targetValue: result.targetValue,
        grayPercent: result.grayPercent,
        matchedDevices: result.matchedDevices,
      },
    };
    return sendCreated(reply, result);
  });

  app.post('/:id/rollback', { onRequest: [app.authenticate, rollbackGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(rollbackSchema, request.body);
    const result = await service.rollback(id, input, request.currentUser?.id);
    request.auditExtra = {
      action: 'ROLLBACK',
      targetType: 'MlModel',
      targetId: id,
      targetName: `${result.from.modelVersion} → ${result.to.modelVersion}`,
      before: result.before,
      after: {
        to: result.to.modelVersion,
        affectedDevices: result.affectedDevices,
        dispatchId: result.rollbackDispatchId,
      },
      reason: input.reason,
    };
    return sendOk(reply, result);
  });

  app.get('/:id/dispatches', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const q = parseOrThrow(listQuerySchema, request.query);
    const { list, total, page, pageSize } = await service.modelDispatchList(id, q);
    return sendPage(reply, list, total, page, pageSize);
  });

  // ---------------- 下发单（跨模型） ----------------
  // 注意：静态路径必须在 /:id 之前注册，否则会被 /:id 捕获

  app.get('/dispatches', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const q = parseOrThrow(dispatchListSchema, request.query);
    const { list, total, page, pageSize } = await service.dispatchList(q);
    return sendPage(reply, list, total, page, pageSize);
  });

  app.get('/dispatches/:id/devices', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const q = parseOrThrow(deviceLogListSchema, request.query);
    const { list, total, page, pageSize } = await service.deviceLogList(id, q);
    return sendPage(reply, list, total, page, pageSize);
  });

  app.post('/dispatches/:id/retry', { onRequest: [app.authenticate, dispatchGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const result = await service.retryFailed(id);
    request.auditExtra = {
      action: 'RETRY',
      targetType: 'ModelDispatch',
      targetId: id,
      targetName: `重试 ${result.retried} 台失败设备`,
      before: result.before,
      after: { retried: result.retried, status: 'DISPATCHING' },
    };
    return sendOk(reply, result);
  });

  // ---------------- APP 端 ----------------

  app.get('/check', async (request, reply) => {
    const q = parseOrThrow(checkModelSchema, request.query);
    return sendOk(reply, await service.checkModel(q));
  });

  app.post('/dispatches/:id/report', async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(reportDispatchSchema, request.body);
    return sendOk(reply, await service.reportDispatch(id, input));
  });
};

export default routes;

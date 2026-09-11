import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow, idParamSchema } from '../../lib/zod';
import { sendOk, sendCreated, sendPage } from '../../lib/response';
import { AppError } from '../../lib/errors';
import {
  misreportListSchema,
  reviewSchema,
  assignSchema,
  updateMisreportSchema,
  batchSchema,
  createMisreportSchema,
} from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const readGuard = app.requirePermission('misreport:read');
  const reviewGuard = app.requirePermission('misreport:review');
  const assignGuard = app.requirePermission('misreport:assign');
  const exportGuard = app.requirePermission('misreport:export');

  /** 列表：分页 + 搜索 + 多维筛选 */
  app.get('/', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const q = parseOrThrow(misreportListSchema, request.query);
    const { list, total, page, pageSize } = await service.list(q);
    return sendPage(reply, list, total, page, pageSize);
  });

  /** 统计（看板复用，静态路径需在 /:id 之前） */
  app.get('/stats', { onRequest: [app.authenticate, readGuard] }, async (_request, reply) => {
    return sendOk(reply, await service.stats());
  });

  /** 导出 CSV */
  app.get('/export', { onRequest: [app.authenticate, exportGuard] }, async (request, reply) => {
    const q = parseOrThrow(misreportListSchema, request.query);
    const csv = await service.exportCsv(q);
    request.auditExtra = {
      action: 'EXPORT',
      targetType: 'Misreport',
      targetName: '误报记录导出',
      after: { filters: q },
    };
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`误报记录_${Date.now()}.csv`)}`,
    );
    return reply.send(csv);
  });

  /** 批量操作 */
  app.post('/batch', { onRequest: [app.authenticate, assignGuard] }, async (request, reply) => {
    const input = parseOrThrow(batchSchema, request.body);
    const op = request.currentUser;
    if (!op) throw AppError.unauthorized();
    const result = await service.batch(input, { id: op.id, displayName: op.displayName });
    request.auditExtra = {
      action: input.action === 'ASSIGN' ? 'BATCH_ASSIGN' : 'BATCH_REVIEW',
      targetType: 'Misreport',
      targetName: `批量${input.action === 'ASSIGN' ? '指派' : '复核'} ${result.affected} 条`,
      after: { affected: result.affected, status: input.status, assignedToId: input.assignedToId },
    };
    return sendOk(reply, result);
  });

  /** APP 端上报 */
  app.post('/', async (request, reply) => {
    const appUser = await app.resolveAppUser(request);
    const input = parseOrThrow(createMisreportSchema, request.body);
    return sendCreated(reply, await service.create({ ...input, userId: appUser?.id ?? input.userId }));
  });

  /** 详情 */
  app.get('/:id', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });

  /** 修改元信息 */
  app.patch('/:id', { onRequest: [app.authenticate, reviewGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(updateMisreportSchema, request.body);
    const { before, after } = await service.update(id, input);
    request.auditExtra = {
      targetType: 'Misreport',
      targetId: id,
      targetName: before.reportNo,
      before: { severity: before.severity, sceneTags: before.sceneTags },
      after: { severity: after.severity, sceneTags: after.sceneTags },
    };
    return sendOk(reply, after);
  });

  /** 人工复核标注 */
  app.post('/:id/review', { onRequest: [app.authenticate, reviewGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(reviewSchema, request.body);
    const op = request.currentUser;
    if (!op) throw AppError.unauthorized();
    const { before, after } = await service.review(id, input, {
      id: op.id,
      displayName: op.displayName,
    });
    request.auditExtra = {
      action: 'REVIEW',
      targetType: 'Misreport',
      targetId: id,
      targetName: before.reportNo,
      before: { status: before.status, groundTruth: before.groundTruth, rootCause: before.rootCause },
      after: {
        status: after.status,
        groundTruth: after.groundTruth,
        rootCause: after.rootCause,
        addToTrainingSet: after.addToTrainingSet,
      },
    };
    return sendOk(reply, after);
  });

  /** 指派 */
  app.post('/:id/assign', { onRequest: [app.authenticate, assignGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(assignSchema, request.body);
    const op = request.currentUser;
    if (!op) throw AppError.unauthorized();
    const { before, after, assigneeName } = await service.assign(id, input, {
      id: op.id,
      displayName: op.displayName,
    });
    request.auditExtra = {
      action: 'ASSIGN',
      targetType: 'Misreport',
      targetId: id,
      targetName: before.reportNo,
      before: { status: before.status },
      after: { status: after.status, assignedTo: assigneeName },
      reason: input.note,
    };
    return sendOk(reply, after);
  });

  /** 状态流转日志 */
  app.get('/:id/logs', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.statusLogs(id));
  });
};

export default routes;

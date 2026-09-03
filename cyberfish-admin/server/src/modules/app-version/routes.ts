import type { FastifyPluginAsync } from 'fastify';
import { AdminRole } from '../../lib/enums';
import { parseOrThrow, idParamSchema } from '../../lib/zod';
import { sendOk, sendCreated, sendPage } from '../../lib/response';
import {
  appVersionListSchema,
  createAppVersionSchema,
  updateAppVersionSchema,
  appVersionActionSchema,
  checkUpdateSchema,
} from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const readGuard = app.requirePermission('appVersion:read');
  const writeGuard = app.requirePermission('appVersion:write');
  const publishGuard = app.requirePermission('appVersion:publish');
  const deleteGuard = app.requirePermission('appVersion:delete');

  /** 列表：分页 + 搜索 + 筛选 */
  app.get('/', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const q = parseOrThrow(appVersionListSchema, request.query);
    const { list, total, page, pageSize } = await service.list(q);
    return sendPage(reply, list, total, page, pageSize);
  });

  /** 详情 */
  app.get('/:id', { onRequest: [app.authenticate, readGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });

  /** 新建 */
  app.post('/', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const input = parseOrThrow(createAppVersionSchema, request.body);
    const created = await service.create(input, request.currentUser?.id);
    request.auditExtra = {
      targetType: 'AppVersion',
      targetId: created.id,
      targetName: `v${created.versionName} (${created.versionCode})`,
      after: { versionName: created.versionName, updateType: created.updateType, status: created.status },
    };
    return sendCreated(reply, created);
  });

  /** 编辑 */
  app.patch('/:id', { onRequest: [app.authenticate, writeGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(updateAppVersionSchema, request.body);
    const { before, after } = await service.update(id, input);
    request.auditExtra = {
      targetType: 'AppVersion',
      targetId: id,
      targetName: `v${before.versionName}`,
      before: { status: before.status, updateType: before.updateType, grayPercent: before.grayPercent },
      after: { status: after.status, updateType: after.updateType, grayPercent: after.grayPercent },
    };
    return sendOk(reply, after);
  });

  /** 删除 */
  app.delete('/:id', { onRequest: [app.authenticate, deleteGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const removed = await service.remove(id);
    request.auditExtra = {
      targetType: 'AppVersion',
      targetId: id,
      targetName: `v${removed.versionName}`,
      before: { status: removed.status },
    };
    return sendOk(reply, { id, deleted: true });
  });

  /** 状态动作：灰度 / 上架 / 下架 / 回滚 */
  app.post('/:id/actions', { onRequest: [app.authenticate, publishGuard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(appVersionActionSchema, request.body);
    const { before, after, previousOnline, reason } = await service.doAction(
      id,
      input,
      request.currentUser?.id,
    );
    request.auditExtra = {
      action: `PUBLISH_${input.action === 'PUBLISH_GRAY' ? 'GRAY' : input.action === 'PUBLISH_ONLINE' ? 'ONLINE' : input.action}`,
      targetType: 'AppVersion',
      targetId: id,
      targetName: `v${before.versionName}`,
      before: { status: before.status, grayPercent: before.grayPercent },
      after: { status: after.status, grayPercent: after.grayPercent, previousOnline },
      reason,
    };
    return sendOk(reply, after);
  });

  /** 版本分布统计 */
  app.get('/stats', { onRequest: [app.authenticate, readGuard] }, async (_request, reply) => {
    return sendOk(reply, await service.stats());
  });

  /** APP 端：检查更新（走 X-App-Token） */
  app.get('/check', async (request, reply) => {
    const q = parseOrThrow(checkUpdateSchema, request.query);
    return sendOk(reply, await service.checkUpdate(q));
  });
};

export default routes;
export { service as appVersionService };

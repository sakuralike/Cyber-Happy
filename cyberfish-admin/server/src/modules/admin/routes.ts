import type { FastifyPluginAsync } from 'fastify';
import { AdminRole } from '../../lib/enums';
import { parseOrThrow, idParamSchema } from '../../lib/zod';
import { sendOk, sendCreated, sendPage } from '../../lib/response';
import { adminListSchema, createAdminSchema, updateAdminSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const guard = app.requireRole(AdminRole.ADMIN);

  app.get('/', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(adminListSchema, request.query);
    const { list, total, page, pageSize } = await service.list(q);
    return sendPage(reply, list, total, page, pageSize);
  });

  app.get('/:id', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });

  app.post('/', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const input = parseOrThrow(createAdminSchema, request.body);
    const created = await service.create(input, request.currentUser?.id);
    request.auditExtra = {
      targetType: 'AdminUser',
      targetId: created.id,
      targetName: `${created.username}(${created.displayName})`,
      after: { username: created.username, role: created.role, displayName: created.displayName },
    };
    return sendCreated(reply, created);
  });

  app.patch('/:id', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const input = parseOrThrow(updateAdminSchema, request.body);
    const { before, after } = await service.update(id, input);
    request.auditExtra = {
      targetType: 'AdminUser',
      targetId: id,
      targetName: `${after.username}(${after.displayName})`,
      before: { role: before.role, status: before.status, displayName: before.displayName },
      after: { role: after.role, status: after.status, displayName: after.displayName },
    };
    return sendOk(reply, after);
  });

  app.delete('/:id', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    const removed = await service.remove(id);
    request.auditExtra = {
      targetType: 'AdminUser',
      targetId: id,
      targetName: `${removed.username}(${removed.displayName})`,
      before: { status: removed.status },
      after: { status: 'DISABLED' },
    };
    return sendOk(reply, { id, disabled: true });
  });
};

export default routes;

import type { FastifyPluginAsync } from 'fastify';
import { AdminRole } from '../../lib/enums';
import { parseOrThrow, idParamSchema } from '../../lib/zod';
import { sendOk, sendPage } from '../../lib/response';
import { auditLogListSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  // VIEWER 也可查看（service 内会限制为仅自身记录）
  const guard = app.requireRole(AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER);

  app.get('/meta', { onRequest: [app.authenticate, guard] }, async (_request, reply) => {
    return sendOk(reply, service.meta());
  });

  app.get('/', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const q = parseOrThrow(auditLogListSchema, request.query);
    const { list, total, page, pageSize } = await service.list(
      q,
      request.currentUser?.role,
      request.currentUser?.id,
    );
    return sendPage(reply, list, total, page, pageSize);
  });

  app.get('/:id', { onRequest: [app.authenticate, guard] }, async (request, reply) => {
    const { id } = parseOrThrow(idParamSchema, request.params);
    return sendOk(reply, await service.detail(id));
  });
};

export default routes;

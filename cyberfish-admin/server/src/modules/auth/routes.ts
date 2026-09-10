import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendOk } from '../../lib/response';
import { clientIp } from '../../lib/logger';
import { loginSchema, updateMeSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  const meta = (req: { headers: Record<string, unknown>; id: string }) => ({
    ip: clientIp(req.headers),
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 500),
    requestId: req.id,
  });

  /** 登录 */
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = parseOrThrow(loginSchema, request.body);
    const m = meta(request as never);
    const result = await service.login(
      input,
      m,
      (payload) => app.jwt.sign(payload),
    );
    return sendOk(reply, result);
  });

  /** 登出 */
  app.post('/logout', { onRequest: [app.authenticate] }, async (request, reply) => {
    await service.logout(reply, request.currentUser?.id);
    return sendOk(reply, { loggedOut: true });
  });

  /** 当前用户 */
  app.get('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const data = await service.me(request.currentUser!.id);
    return sendOk(reply, data);
  });
  app.patch('/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const input = parseOrThrow(updateMeSchema, request.body);
    const data = await service.updateMe(request.currentUser!.id, input);
    request.auditExtra = { module: 'AUTH', action: 'UPDATE', targetType: 'AdminUser', targetId: data.id, targetName: `${data.username}(${data.displayName})`, after: { displayName: data.displayName, email: data.email } };
    return sendOk(reply, data);
  });
};

export default routes;

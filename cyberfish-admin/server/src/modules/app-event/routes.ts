import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendCreated } from '../../lib/response';
import { appEventSchema } from './schema';
import * as service from './service';
import { assertDeviceId, requireDeviceAuth } from '../device-auth/guard';

const routes: FastifyPluginAsync = async (app) => {
  const deviceGuard = requireDeviceAuth(app, 'event:write');
  app.post('/', { preValidation: [deviceGuard] }, async (request, reply) => {
    const appUser = await app.resolveAppUser(request);
    const input = parseOrThrow(appEventSchema, request.body);
    assertDeviceId(request, input.deviceId);
    return sendCreated(reply, await service.record({ ...input, userId: appUser?.id }));
  });
};

export default routes;

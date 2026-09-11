import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendCreated } from '../../lib/response';
import { appEventSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => {
    const appUser = await app.resolveAppUser(request);
    const input = parseOrThrow(appEventSchema, request.body);
    return sendCreated(reply, await service.record({ ...input, userId: appUser?.id ?? input.userId }));
  });
};

export default routes;

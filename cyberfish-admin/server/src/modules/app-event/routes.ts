import type { FastifyPluginAsync } from 'fastify';
import { parseOrThrow } from '../../lib/zod';
import { sendCreated } from '../../lib/response';
import { appEventSchema } from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/', async (request, reply) => sendCreated(reply, await service.record(parseOrThrow(appEventSchema, request.body))));
};

export default routes;

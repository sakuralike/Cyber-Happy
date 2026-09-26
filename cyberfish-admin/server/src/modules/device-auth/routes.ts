import type { FastifyPluginAsync } from 'fastify';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { sendCreated, sendOk } from '../../lib/response';
import { parseOrThrow } from '../../lib/zod';
import { requireDeviceAuth } from './guard';
import {
  createChallengeSchema,
  enrollDeviceSchema,
  exchangeTokenSchema,
  revokeDeviceParamSchema,
} from './schema';
import * as service from './service';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/devices/enroll', async (request, reply) => {
    let userId: string | undefined;
    if (typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ')) {
      userId = (await app.resolveAppUser(request))?.id;
    } else if (config.deviceAuthDualMode && service.isValidLegacyToken(request.headers['x-app-token'])) {
      userId = undefined;
    } else {
      throw AppError.unauthorized('设备登记需要有效的 APP 凭据或用户登录');
    }
    const input = parseOrThrow(enrollDeviceSchema, request.body);
    return sendCreated(reply, await service.enroll(input, userId));
  });

  app.post('/devices/challenges', async (request, reply) => {
    const input = parseOrThrow(createChallengeSchema, request.body);
    return sendCreated(reply, await service.createChallenge(input));
  });

  app.post('/devices/token', async (request, reply) => {
    const input = parseOrThrow(exchangeTokenSchema, request.body);
    return sendOk(reply, await service.exchangeToken(input, (payload) => app.jwt.sign(payload)));
  });

  app.post(
    '/devices/refresh',
    { preValidation: [requireDeviceAuth(app, undefined, { allowLegacy: false })] },
    async (request, reply) => {
      if (!request.currentDevice) throw AppError.unauthorized('缺少设备身份');
      return sendOk(reply, await service.refresh(request.currentDevice.credentialId, (payload) => app.jwt.sign(payload)));
    },
  );

  app.post(
    '/admin/devices/:id/revoke',
    { onRequest: [app.authenticate, app.requirePermission('model:write')] },
    async (request, reply) => {
      const { id } = parseOrThrow(revokeDeviceParamSchema, request.params);
      const result = await service.revoke(id);
      request.auditExtra = {
        module: 'MODEL',
        action: 'UPDATE',
        targetType: 'AppDeviceCredential',
        targetId: id,
        targetName: result.deviceId,
        after: { status: result.status, revokedAt: result.revokedAt },
      };
      return sendOk(reply, result);
    },
  );
};

export default routes;

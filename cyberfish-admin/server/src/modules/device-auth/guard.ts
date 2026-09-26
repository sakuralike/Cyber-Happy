import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';
import { AppError } from '../../lib/errors';
import { verifySignedRequest } from './service';

export function requireDeviceAuth(
  app: FastifyInstance,
  scope?: string,
  options: { allowLegacy?: boolean } = {},
) {
  return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (request.isAppClient) {
      if (options.allowLegacy !== false && config.deviceAuthDualMode) return;
      throw AppError.unauthorized('该接口不接受共享 APP Token');
    }
    request.currentDevice = await verifySignedRequest(request, scope, (token) => app.jwt.verify(token));
  };
}

export function assertDeviceId(request: FastifyRequest, deviceId: string): void {
  if (request.currentDevice && request.currentDevice.deviceId !== deviceId) {
    throw AppError.forbidden('请求设备 ID 与设备凭据不一致');
  }
}

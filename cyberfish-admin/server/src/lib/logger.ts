import pino from 'pino';
import { config } from '../config';

export const logger: pino.Logger = pino({
  level: config.logLevel,
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
});

export type Logger = typeof logger;

/** 从 Fastify 请求中提取客户端 IP（兼容反向代理） */
export function clientIp(headers: Record<string, unknown>): string {
  const xf = headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  const xr = headers['x-real-ip'];
  if (typeof xr === 'string' && xr.length > 0) return xr;
  return 'unknown';
}

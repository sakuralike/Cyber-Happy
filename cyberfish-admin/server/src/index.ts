import { buildApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { startDispatchWorker, stopDispatchWorker } from './jobs/dispatch-worker';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`赛博鱼乐管理后台 · API 已启动: http://localhost:${config.port}/api/v1`);
    logger.info(`健康检查: http://localhost:${config.port}/health`);
  } catch (err) {
    logger.error({ err }, '服务启动失败');
    process.exit(1);
  }

  // 模型下发调度器
  startDispatchWorker();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`收到 ${signal}，正在优雅退出...`);
    stopDispatchWorker();
    try {
      await app.close();
      await prisma.$disconnect();
    } catch (err) {
      logger.error({ err }, '退出时发生异常');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '未处理的 Promise 拒绝');
  });
}

void main();

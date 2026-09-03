import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const BATCH_SIZE = 50;
const TICK_MS = 10_000;

/**
 * 下发单调度器
 * ------------------------------------------------------------
 * 把 PENDING 的下发单推进到 DISPATCHING，并逐批把设备日志推到 SUCCESS。
 * 演示实现：以可控速率模拟设备下载结果（约 4% 失败率，用于验证 PARTIAL/FAILED 分支）。
 * 生产环境替换为真实推送 / 长连接通道即可，服务层接口契约不变。
 */
let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.modelDispatch.findMany({
      where: { status: { in: ['PENDING', 'DISPATCHING'] } },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const d of pending) {
      if (d.status === 'PENDING') {
        await prisma.modelDispatch.update({
          where: { id: d.id },
          data: { status: 'DISPATCHING', startedAt: new Date() },
        });
      }

      const batch = await prisma.deviceDispatchLog.findMany({
        where: { dispatchId: d.id, status: { in: ['PENDING', 'DOWNLOADING'] } },
        orderBy: { deviceId: 'asc' },
        take: BATCH_SIZE,
      });

      for (const log of batch) {
        const roll = Math.random();
        // 进入下载中 → 下一轮再定结果，模拟真实下载耗时
        if (log.status === 'PENDING' && roll < 0.5) {
          await prisma.deviceDispatchLog.update({
            where: { id: log.id },
            data: { status: 'DOWNLOADING', progress: 10 + Math.floor(Math.random() * 60) },
          });
          continue;
        }
        const ok = roll > 0.04; // 4% 失败
        await prisma.deviceDispatchLog.update({
          where: { id: log.id },
          data: ok
            ? { status: 'SUCCESS', progress: 100 }
            : { status: 'FAILED', progress: log.progress, errorCode: 'E_DOWNLOAD', errorMessage: '下载超时或校验失败' },
        });
      }

      // 重算聚合
      const agg = await prisma.deviceDispatchLog.groupBy({
        by: ['status'],
        where: { dispatchId: d.id },
        _count: { _all: true },
      });
      const cnt = (s: string) => agg.find((a) => a.status === s)?._count._all ?? 0;
      const total = agg.reduce((s, a) => s + a._count._all, 0);
      const success = cnt('SUCCESS') + cnt('ROLLED_BACK');
      const failed = cnt('FAILED');
      const done = success + failed;

      let status: 'DISPATCHING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'DISPATCHING';
      if (total > 0 && done === total) {
        status = failed === 0 ? 'SUCCESS' : success === 0 ? 'FAILED' : 'PARTIAL';
      }

      await prisma.modelDispatch.update({
        where: { id: d.id },
        data: {
          totalDevices: total,
          successDevices: success,
          failedDevices: failed,
          status,
          finishedAt: status === 'DISPATCHING' ? null : new Date(),
        },
      });
    }
  } catch (err) {
    logger.error({ err }, '[dispatch-worker] 调度异常');
  } finally {
    running = false;
  }
}

export function startDispatchWorker(): void {
  if (timer) return;
  logger.info(`[dispatch-worker] 启动，轮询间隔 ${TICK_MS / 1000}s`);
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

export function stopDispatchWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

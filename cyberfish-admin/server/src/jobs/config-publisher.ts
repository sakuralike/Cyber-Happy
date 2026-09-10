import { logger } from "../lib/logger";
import { publishScheduled } from "../modules/system-settings/service";

let timer: NodeJS.Timeout | null = null;

export function startConfigPublisher(): void {
  if (timer) return;
  timer = setInterval(() => {
    void publishScheduled()
      .then((count) => {
        if (count > 0)
          logger.info({ count }, "[config-publisher] 定时配置已生效");
      })
      .catch((error) =>
        logger.error({ error }, "[config-publisher] 定时发布失败"),
      );
  }, 30_000);
  timer.unref();
}

export function stopConfigPublisher(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

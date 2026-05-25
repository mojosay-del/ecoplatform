import { Logger } from "@nestjs/common";

// Возвращает callback, который логирует ошибку через NestJS Logger и
// «глотает» её. Используйте вместо `.catch(() => undefined)` в местах,
// где сам факт ошибки не должен ронять основной flow (отправка
// уведомлений после транзакции, аналитика, side-effects), но молча
// её терять — плохо для отладки.
//
// Пример:
//   await this.notify(post).catch(swallowAndLog("notify.post.published", { postId: post.id }));
export function swallowAndLog(context: string, payload?: Record<string, unknown>) {
  const logger = new Logger("SilentCatch");
  return (error: unknown) => {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : typeof error === "string" ? error : "unknown error";
    logger.warn(`[${context}] suppressed: ${message}${payload ? ` ${JSON.stringify(payload)}` : ""}`);
    return undefined;
  };
}

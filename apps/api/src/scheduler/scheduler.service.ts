import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Координатор регулярных фоновых задач.
 *
 * На этом шаге сервис только пингует логи каждый час — это даёт работающий
 * каркас для последующих коммитов Волны 4, где появится реальная логика
 * (биллинг-уведомления, очистка истёкших lock'ов модерации и пр.).
 *
 * Запуск задач можно полностью отключить переменной SCHEDULER_DISABLED=1
 * (актуально для unit-/integration-тестов и быстрого dev-режима).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === "1";
  }

  @Cron(CronExpression.EVERY_HOUR, { name: "hourly-heartbeat" })
  async handleHourlyTick() {
    if (this.disabled) return;
    this.logger.log("Hourly tick — scheduler heartbeat");
  }
}

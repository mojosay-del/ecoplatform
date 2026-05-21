import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BillingNotificationsService } from "../billing/billing-notifications.service";

/**
 * Координатор регулярных фоновых задач.
 *
 * Сейчас на нём висит одна задача: раз в час BillingNotificationsService
 * проверяет компании и отправляет уведомления о скором/случившемся
 * истечении демо и подписки.
 *
 * Запуск задач можно полностью отключить переменной SCHEDULER_DISABLED=1
 * (актуально для integration-тестов — для биллинг-логики используется
 * прямой вызов runHourlyCheck() с подменённым `now`).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly billing: BillingNotificationsService) {}

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === "1";
  }

  @Cron(CronExpression.EVERY_HOUR, { name: "billing-hourly-check" })
  async handleHourlyBillingCheck() {
    if (this.disabled) return;
    try {
      await this.billing.runHourlyCheck();
    } catch (error) {
      this.logger.error("Hourly billing check failed", error as Error);
    }
  }
}

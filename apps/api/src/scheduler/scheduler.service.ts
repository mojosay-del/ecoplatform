import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BillingNotificationsService } from "../billing/billing-notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const BILLING_HOURLY_LOCK_KEY = "cron:billing-hourly-check";
const CRON_LOCK_TRANSACTION_TIMEOUT_MS = 15 * 60 * 1000;

type AdvisoryLockRow = {
  ok: boolean;
};

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

  constructor(
    private readonly billing: BillingNotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  private get disabled(): boolean {
    return process.env.SCHEDULER_DISABLED === "1";
  }

  @Cron(CronExpression.EVERY_HOUR, { name: "billing-hourly-check" })
  async handleHourlyBillingCheck() {
    if (this.disabled) return;
    try {
      await this.runWithPostgresAdvisoryLock(BILLING_HOURLY_LOCK_KEY, () => this.billing.runHourlyCheck());
    } catch (error) {
      this.logger.error("Hourly billing check failed", error as Error);
    }
  }

  private async runWithPostgresAdvisoryLock(lockKey: string, task: () => Promise<unknown>): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<AdvisoryLockRow[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS ok
        `;

        if (!lock?.ok) {
          this.logger.debug(`Cron lock "${lockKey}" is already held; skipping tick`);
          return false;
        }

        await task();
        return true;
      },
      { maxWait: 5_000, timeout: CRON_LOCK_TRANSACTION_TIMEOUT_MS },
    );
  }
}

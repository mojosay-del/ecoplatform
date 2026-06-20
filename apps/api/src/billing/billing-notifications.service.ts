import { Injectable, Logger } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, SubscriptionStatus } from "@prisma/client";
import { mapWithConcurrency } from "../common/concurrency";
import { swallowAndLog } from "../common/silent-catch";
import { NotificationsService, type CreateInAppNotificationInput } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { formatBillingNotificationDateTime } from "./billing-notification-dates";

// Рассылка батчится с ограниченной конкуррентностью: каждое уведомление — это
// отдельная транзакция, поэтому unbounded Promise.all мог бы исчерпать пул
// соединений при массовом истечении демо/подписок.
const NOTIFY_CONCURRENCY = 8;

/**
 * Регулярная проверка биллинг-состояния компаний:
 *  — за 3 дня до конца демо     → уведомление billing.demo.expiring
 *  — демо истёк                  → уведомление billing.demo.expired + перевод компании в past_due
 *  — за 7 дней до конца подписки → уведомление billing.subscription.expiring
 *  — подписка истекла            → уведомление billing.subscription.expired + перевод компании в past_due,
 *                                  подписка переводится в expired
 *
 * Дедупликация обеспечивается через domainEventId на стороне NotificationsService —
 * повторный запуск cron в том же часе/дне не создаёт дублирующего уведомления.
 */
@Injectable()
export class BillingNotificationsService {
  private readonly logger = new Logger(BillingNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async runHourlyCheck(now: Date = new Date()): Promise<{
    demoExpiringNotified: number;
    demoExpired: number;
    subscriptionExpiringNotified: number;
    subscriptionExpired: number;
  }> {
    const result = {
      demoExpiringNotified: 0,
      demoExpired: 0,
      subscriptionExpiringNotified: 0,
      subscriptionExpired: 0,
    };

    result.demoExpiringNotified = await this.notifyDemoExpiring(now);
    result.demoExpired = await this.expireDemo(now);
    result.subscriptionExpiringNotified = await this.notifySubscriptionExpiring(now);
    result.subscriptionExpired = await this.expireSubscription(now);

    this.logger.log(
      `Billing check: demoExpiring=${result.demoExpiringNotified}, demoExpired=${result.demoExpired}, ` +
        `subExpiring=${result.subscriptionExpiringNotified}, subExpired=${result.subscriptionExpired}`,
    );

    return result;
  }

  private async notifyDemoExpiring(now: Date): Promise<number> {
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.demo,
        demoEndsAt: { gt: now, lte: threeDaysLater },
      },
      include: { users: { select: { id: true } } },
    });

    const messages = companies.flatMap((company) => {
      const endsAt = company.demoEndsAt!;
      const sourceId = `${company.id}:${endsAt.toISOString().slice(0, 10)}`;
      return company.users.map((user) => ({
        userId: user.id,
        eventType: "billing.demo.expiring",
        sourceId,
        category: NotificationCategory.billing,
        title: "Демо-доступ скоро закончится",
        body: `Демо-период компании заканчивается ${formatBillingNotificationDateTime(endsAt)}. Активируйте подписку, чтобы сохранить доступ к разделам.`,
        link: "/account",
        payload: { companyId: company.id, demoEndsAt: endsAt.toISOString() },
      }));
    });

    await this.dispatch(messages);
    return companies.length;
  }

  private async expireDemo(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.demo,
        demoEndsAt: { lt: now },
      },
      include: { users: { select: { id: true } } },
    });

    if (companies.length === 0) {
      return 0;
    }

    // Одним запросом вместо update в цикле; where по статусу сохраняет
    // идемпотентность при повторном тике.
    await this.prisma.company.updateMany({
      where: { id: { in: companies.map((company) => company.id) }, status: CompanyStatus.demo },
      data: { status: CompanyStatus.past_due },
    });

    const messages = companies.flatMap((company) => {
      const sourceId = `${company.id}:${company.demoEndsAt?.toISOString() ?? "unknown"}`;
      return company.users.map((user) => ({
        userId: user.id,
        eventType: "billing.demo.expired",
        sourceId,
        category: NotificationCategory.billing,
        title: "Демо-доступ закончился",
        body: "Демо-период компании завершён. Для возобновления доступа активируйте подписку.",
        link: "/account",
        payload: { companyId: company.id },
      }));
    });

    await this.dispatch(messages);
    return companies.length;
  }

  private async notifySubscriptionExpiring(now: Date): Promise<number> {
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.active,
        subscriptionEndsAt: { gt: now, lte: sevenDaysLater },
      },
      include: { users: { select: { id: true } } },
    });

    const messages = companies.flatMap((company) => {
      const endsAt = company.subscriptionEndsAt!;
      const sourceId = `${company.id}:${endsAt.toISOString().slice(0, 10)}`;
      return company.users.map((user) => ({
        userId: user.id,
        eventType: "billing.subscription.expiring",
        sourceId,
        category: NotificationCategory.billing,
        title: "Подписка скоро закончится",
        body: `Подписка компании заканчивается ${formatBillingNotificationDateTime(endsAt)}. Продлите, чтобы сохранить доступ.`,
        link: "/account",
        payload: {
          companyId: company.id,
          subscriptionEndsAt: endsAt.toISOString(),
          plan: company.subscriptionPlan,
        },
      }));
    });

    await this.dispatch(messages);
    return companies.length;
  }

  private async expireSubscription(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.active,
        subscriptionEndsAt: { lt: now },
      },
      include: { users: { select: { id: true } } },
    });

    if (companies.length === 0) {
      return 0;
    }

    // Перевод статусов одним батчем (компании + их активные подписки) в одной
    // транзакции вместо отдельной транзакции на каждую компанию.
    const companyIds = companies.map((company) => company.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.company.updateMany({
        where: { id: { in: companyIds }, status: CompanyStatus.active },
        data: { status: CompanyStatus.past_due },
      });
      await tx.subscription.updateMany({
        where: { companyId: { in: companyIds }, status: SubscriptionStatus.active },
        data: { status: SubscriptionStatus.expired },
      });
    });

    const messages = companies.flatMap((company) => {
      const sourceId = `${company.id}:${company.subscriptionEndsAt?.toISOString() ?? "unknown"}`;
      return company.users.map((user) => ({
        userId: user.id,
        eventType: "billing.subscription.expired",
        sourceId,
        category: NotificationCategory.billing,
        title: "Подписка закончилась",
        body: "Срок действия подписки истёк. Для продолжения работы оформите новую подписку.",
        link: "/account",
        payload: { companyId: company.id },
      }));
    });

    await this.dispatch(messages);
    return companies.length;
  }

  // Батч-рассылка in-app уведомлений с ограниченной конкуррентностью. Сбой
  // одного уведомления не валит весь тик (как и раньше — тихо логируется).
  private async dispatch(messages: CreateInAppNotificationInput[]): Promise<void> {
    await mapWithConcurrency(messages, NOTIFY_CONCURRENCY, (message) =>
      this.notifications.createInApp(message).catch(swallowAndLog("billing.notifications.dispatch")),
    );
  }
}

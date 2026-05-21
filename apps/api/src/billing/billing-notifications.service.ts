import { Injectable, Logger } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, SubscriptionStatus } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

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

    let count = 0;
    for (const company of companies) {
      const endsAt = company.demoEndsAt!;
      const dateKey = endsAt.toISOString().slice(0, 10);
      const sourceId = `${company.id}:${dateKey}`;

      for (const user of company.users) {
        await this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.demo.expiring",
            sourceId,
            category: NotificationCategory.billing,
            title: "Демо-доступ скоро закончится",
            body: `Демо-период компании заканчивается ${endsAt.toLocaleString("ru-RU")}. Активируйте подписку, чтобы сохранить доступ к разделам.`,
            link: "/account",
            payload: { companyId: company.id, demoEndsAt: endsAt.toISOString() },
          })
          .catch(() => undefined);
      }
      count += 1;
    }
    return count;
  }

  private async expireDemo(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.demo,
        demoEndsAt: { lt: now },
      },
      include: { users: { select: { id: true } } },
    });

    for (const company of companies) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { status: CompanyStatus.past_due },
      });

      const sourceId = `${company.id}:${company.demoEndsAt?.toISOString() ?? "unknown"}`;
      for (const user of company.users) {
        await this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.demo.expired",
            sourceId,
            category: NotificationCategory.billing,
            title: "Демо-доступ закончился",
            body: "Демо-период компании завершён. Для возобновления доступа активируйте подписку.",
            link: "/account",
            payload: { companyId: company.id },
          })
          .catch(() => undefined);
      }
    }
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

    let count = 0;
    for (const company of companies) {
      const endsAt = company.subscriptionEndsAt!;
      const dateKey = endsAt.toISOString().slice(0, 10);
      const sourceId = `${company.id}:${dateKey}`;

      for (const user of company.users) {
        await this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.subscription.expiring",
            sourceId,
            category: NotificationCategory.billing,
            title: "Подписка скоро закончится",
            body: `Подписка компании заканчивается ${endsAt.toLocaleString("ru-RU")}. Продлите, чтобы сохранить доступ.`,
            link: "/account",
            payload: {
              companyId: company.id,
              subscriptionEndsAt: endsAt.toISOString(),
              plan: company.subscriptionPlan,
            },
          })
          .catch(() => undefined);
      }
      count += 1;
    }
    return count;
  }

  private async expireSubscription(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      where: {
        status: CompanyStatus.active,
        subscriptionEndsAt: { lt: now },
      },
      include: { users: { select: { id: true } } },
    });

    for (const company of companies) {
      await this.prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: company.id },
          data: { status: CompanyStatus.past_due },
        });
        await tx.subscription.updateMany({
          where: { companyId: company.id, status: SubscriptionStatus.active },
          data: { status: SubscriptionStatus.expired },
        });
      });

      const sourceId = `${company.id}:${company.subscriptionEndsAt?.toISOString() ?? "unknown"}`;
      for (const user of company.users) {
        await this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.subscription.expired",
            sourceId,
            category: NotificationCategory.billing,
            title: "Подписка закончилась",
            body: "Срок действия подписки истёк. Для продолжения работы оформите новую подписку.",
            link: "/account",
            payload: { companyId: company.id },
          })
          .catch(() => undefined);
      }
    }
    return companies.length;
  }
}

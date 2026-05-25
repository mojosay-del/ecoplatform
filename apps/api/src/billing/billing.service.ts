import { Injectable, NotFoundException } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, SubscriptionStatus } from "@prisma/client";
import type { ManualSubscriptionDto } from "@ecoplatform/shared";
import { swallowAndLog } from "../common/silent-catch";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getOwnStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    return company;
  }

  async listCompanies(pagination: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(pagination.limit ?? 50, 1), 200);
    const offset = Math.max(pagination.offset ?? 0, 0);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.company.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          // `include: { users: true }` тянул бы passwordHash в админ-ответ —
          // явный select оставляет только то, что нужно списку.
          users: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
            },
          },
          subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
    ]);

    return { items, total, hasMore: offset + items.length < total };
  }

  async activateManually(input: ManualSubscriptionDto, actorId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          companyId: input.companyId,
          plan: input.plan,
          status: SubscriptionStatus.active,
          startsAt: new Date(),
          endsAt: new Date(input.endsAt),
          reason: input.reason,
        },
      });

      const updatedCompany = await tx.company.update({
        where: { id: input.companyId },
        data: {
          status: CompanyStatus.active,
          subscriptionPlan: input.plan,
          subscriptionEndsAt: new Date(input.endsAt),
        },
      });

      await tx.adminActionLog.create({
        data: {
          actorId,
          action: "manual_subscription_activation",
          entityType: "Company",
          entityId: input.companyId,
          comment: input.reason,
          payload: { plan: input.plan, endsAt: input.endsAt },
        },
      });

      return { company: updatedCompany, subscription };
    });

    // Уведомляем всех пользователей компании — симметрично уведомлениям о
    // скором/состоявшемся истечении подписки, чтобы биллинг-канал был полным.
    const users = await this.prisma.user.findMany({
      where: { companyId: input.companyId },
      select: { id: true },
    });
    const endsAtIso = new Date(input.endsAt).toISOString();
    await Promise.all(
      users.map((user) =>
        this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.subscription.activated",
            sourceId: result.subscription.id,
            category: NotificationCategory.billing,
            title: "Подписка активирована",
            body: `Активирован тариф ${input.plan} до ${new Date(input.endsAt).toLocaleString("ru-RU")}.`,
            link: "/account",
            payload: { plan: input.plan, endsAt: endsAtIso },
          })
          .catch(
            swallowAndLog("billing.manual_activation.notify", {
              userId: user.id,
              subscriptionId: result.subscription.id,
            }),
          ),
      ),
    );

    return result;
  }
}

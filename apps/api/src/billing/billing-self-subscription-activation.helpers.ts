import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, SubscriptionStatus } from "@prisma/client";
import type { SelfSubscriptionDto } from "@ecoplatform/shared";
import { computeDiff } from "../common/admin-action-log.service";
import { toPrismaJson } from "../common/prisma-json";
import { swallowAndLog } from "../common/silent-catch";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { formatBillingNotificationDateTime } from "./billing-notification-dates";
import {
  addDays,
  isCompanySubscriptionCurrentlyActive,
  isUniqueConstraintError,
  replayManualSubscription,
  serializeCompany,
  serializeSubscription,
  type ManualSubscriptionResponse,
} from "./billing-subscription.helpers";

const SELF_SUBSCRIPTION_ENDPOINT = "POST /api/billing/subscriptions";
const SELF_SUBSCRIPTION_ACTION = "self_subscription_activation";
const SELF_SUBSCRIPTION_DAYS = 30;

export async function createSelfSubscriptionActivation(
  prisma: PrismaService,
  input: SelfSubscriptionDto,
  actorId: string,
  companyId: string,
  key: string,
  requestHash: string,
): Promise<ManualSubscriptionResponse> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
  });
  if (existing) {
    return replayManualSubscription(existing, requestHash);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key,
          endpoint: SELF_SUBSCRIPTION_ENDPOINT,
          action: SELF_SUBSCRIPTION_ACTION,
          actorId,
          requestHash,
        },
      });

      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) {
        throw new NotFoundException("Компания не найдена.");
      }

      if (isCompanySubscriptionCurrentlyActive(company)) {
        throw new ConflictException("Подписка уже активна. Продление через оплату появится следующим шагом.");
      }

      if (company.status === CompanyStatus.suspended || company.status === CompanyStatus.pending_deletion) {
        throw new ForbiddenException("Для этой компании самостоятельная активация подписки временно недоступна.");
      }

      await tx.subscription.updateMany({
        where: { companyId, status: SubscriptionStatus.active, endsAt: { lt: new Date() } },
        data: { status: SubscriptionStatus.expired },
      });

      const startsAt = new Date();
      const endsAt = addDays(startsAt, SELF_SUBSCRIPTION_DAYS);
      const subscription = await tx.subscription.create({
        data: {
          companyId,
          plan: input.plan,
          status: SubscriptionStatus.active,
          startsAt,
          endsAt,
          reason: "Активация пользователем на странице выбора тарифа",
        },
      });

      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          status: CompanyStatus.active,
          statusBeforeDeletion: null,
          subscriptionPlan: input.plan,
          subscriptionEndsAt: endsAt,
        },
      });

      const before = {
        status: company.status,
        subscriptionPlan: company.subscriptionPlan,
        subscriptionEndsAt: company.subscriptionEndsAt?.toISOString() ?? null,
      };
      const after = {
        status: updatedCompany.status,
        subscriptionPlan: updatedCompany.subscriptionPlan,
        subscriptionEndsAt: updatedCompany.subscriptionEndsAt?.toISOString() ?? null,
      };
      const auditPayload: Record<string, unknown> = {
        before,
        after,
        diff: computeDiff(before, after),
        subscriptionId: subscription.id,
        source: "subscription_page",
        durationDays: SELF_SUBSCRIPTION_DAYS,
      };
      await tx.adminActionLog.create({
        data: {
          actorId,
          action: SELF_SUBSCRIPTION_ACTION,
          entityType: "Company",
          entityId: companyId,
          comment: "Пользователь выбрал подписку на странице выбора тарифа.",
          payload: toPrismaJson(auditPayload),
        },
      });

      const response = {
        company: serializeCompany(updatedCompany),
        subscription: serializeSubscription(subscription),
      };

      await tx.idempotencyKey.update({
        where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
        data: {
          response: toPrismaJson(response),
          referenceType: "Subscription",
          referenceId: subscription.id,
        },
      });

      return response;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
      });
      if (existing) {
        return replayManualSubscription(existing, requestHash);
      }
    }

    throw error;
  }
}

export async function notifySelfActivation(
  prisma: PrismaService,
  notifications: NotificationsService,
  input: SelfSubscriptionDto,
  result: ManualSubscriptionResponse,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { companyId: result.company.id },
    select: { id: true },
  });
  const planLabel = input.plan === "basic" ? "Базовая" : "Расширенная";
  await Promise.all(
    users.map((user) =>
      notifications
        .createInApp({
          userId: user.id,
          eventType: "billing.subscription.activated",
          sourceId: result.subscription.id,
          category: NotificationCategory.billing,
          title: "Подписка активирована",
          body: `${planLabel} подписка активирована до ${formatBillingNotificationDateTime(result.subscription.endsAt)}.`,
          link: "/account/billing",
          payload: { plan: input.plan, endsAt: result.subscription.endsAt, source: "subscription_page" },
        })
        .catch(
          swallowAndLog("billing.self_activation.notify", {
            userId: user.id,
            subscriptionId: result.subscription.id,
          }),
        ),
    ),
  );
}

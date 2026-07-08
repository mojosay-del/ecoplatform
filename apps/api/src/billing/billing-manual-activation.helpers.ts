import { NotFoundException } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, SubscriptionStatus } from "@prisma/client";
import { subscriptionPlanLabel, type ManualSubscriptionDto } from "@ecoplatform/shared";
import { computeDiff } from "../common/admin-action-log.service";
import { toPrismaJson } from "../common/prisma-json";
import { swallowAndLog } from "../common/silent-catch";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { formatBillingNotificationDateTime } from "./billing-notification-dates";
import {
  isUniqueConstraintError,
  replayManualSubscription,
  serializeCompany,
  serializeSubscription,
  type ManualSubscriptionResponse,
} from "./billing-subscription.helpers";

const MANUAL_SUBSCRIPTION_ENDPOINT = "POST /api/admin/billing/manual-subscriptions";
const MANUAL_SUBSCRIPTION_ACTION = "manual_subscription_activation";

export async function createManualSubscriptionActivation(
  prisma: PrismaService,
  input: ManualSubscriptionDto,
  actorId: string,
  key: string,
  requestHash: string,
): Promise<ManualSubscriptionResponse> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
  });
  if (existing) {
    return replayManualSubscription(existing, requestHash);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key,
          endpoint: MANUAL_SUBSCRIPTION_ENDPOINT,
          action: MANUAL_SUBSCRIPTION_ACTION,
          actorId,
          requestHash,
        },
      });

      const company = await tx.company.findUnique({ where: { id: input.companyId } });

      if (!company) {
        throw new NotFoundException("Компания не найдена.");
      }

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
          statusBeforeDeletion: null,
          subscriptionPlan: input.plan,
          subscriptionEndsAt: new Date(input.endsAt),
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
      };
      await tx.adminActionLog.create({
        data: {
          actorId,
          action: MANUAL_SUBSCRIPTION_ACTION,
          entityType: "Company",
          entityId: input.companyId,
          comment: input.reason,
          payload: toPrismaJson(auditPayload),
        },
      });

      const response = {
        company: serializeCompany(updatedCompany),
        subscription: serializeSubscription(subscription),
      };

      await tx.idempotencyKey.update({
        where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
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
        where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
      });
      if (existing) {
        return replayManualSubscription(existing, requestHash);
      }
    }

    throw error;
  }
}

export async function notifyManualActivation(
  prisma: PrismaService,
  notifications: NotificationsService,
  input: ManualSubscriptionDto,
  result: ManualSubscriptionResponse,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { companyId: input.companyId },
    select: { id: true },
  });
  await Promise.all(
    users.map((user) =>
      notifications
        .createInApp({
          userId: user.id,
          eventType: "billing.subscription.activated",
          sourceId: result.subscription.id,
          category: NotificationCategory.billing,
          title: "Подписка активирована",
          body: `Активирован тариф «${subscriptionPlanLabel(input.plan)}» до ${formatBillingNotificationDateTime(result.subscription.endsAt)}.`,
          link: "/account",
          payload: { plan: input.plan, endsAt: result.subscription.endsAt },
        })
        .catch(
          swallowAndLog("billing.manual_activation.notify", {
            userId: user.id,
            subscriptionId: result.subscription.id,
          }),
        ),
    ),
  );
}

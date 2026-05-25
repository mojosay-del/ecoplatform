import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "crypto";
import { CompanyStatus, NotificationCategory, Prisma, SubscriptionStatus } from "@prisma/client";
import type { Company, Subscription } from "@prisma/client";
import type { ManualSubscriptionDto } from "@ecoplatform/shared";
import { swallowAndLog } from "../common/silent-catch";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const MANUAL_SUBSCRIPTION_ENDPOINT = "POST /api/admin/billing/manual-subscriptions";
const MANUAL_SUBSCRIPTION_ACTION = "manual_subscription_activation";

type ManualSubscriptionResponse = {
  company: ReturnType<typeof serializeCompany>;
  subscription: ReturnType<typeof serializeSubscription>;
};

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

  async activateManually(
    input: ManualSubscriptionDto,
    actorId: string,
    idempotencyKey: string | undefined,
  ): Promise<ManualSubscriptionResponse> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const requestHash = hashManualSubscriptionRequest(input);

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
    });
    if (existing) {
      return replayManualSubscription(existing, requestHash);
    }

    const result = await this.createManualSubscriptionWithIdempotency(input, actorId, key, requestHash);

    // Уведомляем всех пользователей компании — симметрично уведомлениям о
    // скором/состоявшемся истечении подписки, чтобы биллинг-канал был полным.
    await this.notifyManualActivation(input, result);

    return result;
  }

  private async createManualSubscriptionWithIdempotency(
    input: ManualSubscriptionDto,
    actorId: string,
    key: string,
    requestHash: string,
  ): Promise<ManualSubscriptionResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
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
            subscriptionPlan: input.plan,
            subscriptionEndsAt: new Date(input.endsAt),
          },
        });

        await tx.adminActionLog.create({
          data: {
            actorId,
            action: MANUAL_SUBSCRIPTION_ACTION,
            entityType: "Company",
            entityId: input.companyId,
            comment: input.reason,
            payload: { plan: input.plan, endsAt: input.endsAt },
          },
        });

        const response = {
          company: serializeCompany(updatedCompany),
          subscription: serializeSubscription(subscription),
        };

        await tx.idempotencyKey.update({
          where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
          data: {
            response: response as unknown as Prisma.InputJsonValue,
            referenceType: "Subscription",
            referenceId: subscription.id,
          },
        });

        return response;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { key_endpoint_actorId: { key, endpoint: MANUAL_SUBSCRIPTION_ENDPOINT, actorId } },
        });
        if (existing) {
          return replayManualSubscription(existing, requestHash);
        }
      }

      throw error;
    }
  }

  private async notifyManualActivation(
    input: ManualSubscriptionDto,
    result: ManualSubscriptionResponse,
  ): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { companyId: input.companyId },
      select: { id: true },
    });
    await Promise.all(
      users.map((user) =>
        this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.subscription.activated",
            sourceId: result.subscription.id,
            category: NotificationCategory.billing,
            title: "Подписка активирована",
            body: `Активирован тариф ${input.plan} до ${new Date(result.subscription.endsAt).toLocaleString("ru-RU")}.`,
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
}

function normalizeIdempotencyKey(key: string | undefined): string {
  const normalized = key?.trim();

  if (!normalized) {
    throw new BadRequestException("Idempotency-Key обязателен для ручной активации подписки.");
  }

  if (normalized.length < 8 || normalized.length > 128) {
    throw new BadRequestException("Idempotency-Key должен быть от 8 до 128 символов.");
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new BadRequestException("Idempotency-Key содержит недопустимые символы.");
  }

  return normalized;
}

function hashManualSubscriptionRequest(input: ManualSubscriptionDto): string {
  return createHash("sha256")
    .update(
      stableStringify({
        companyId: input.companyId,
        endsAt: new Date(input.endsAt).toISOString(),
        plan: input.plan,
        reason: input.reason,
      }),
    )
    .digest("hex");
}

function replayManualSubscription(
  existing: { requestHash: string; response: Prisma.JsonValue | null },
  requestHash: string,
): ManualSubscriptionResponse {
  if (existing.requestHash !== requestHash) {
    throw new ConflictException("Idempotency-Key уже использован с другим payload.");
  }

  if (!existing.response) {
    throw new ConflictException("Запрос с этим Idempotency-Key ещё обрабатывается. Повторите позже.");
  }

  return existing.response as unknown as ManualSubscriptionResponse;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function serializeCompany(company: Company) {
  return {
    id: company.id,
    organizationName: company.organizationName,
    type: company.type,
    status: company.status,
    demoEndsAt: company.demoEndsAt?.toISOString() ?? null,
    subscriptionPlan: company.subscriptionPlan,
    subscriptionEndsAt: company.subscriptionEndsAt?.toISOString() ?? null,
    billingInn: company.billingInn,
    billingKpp: company.billingKpp,
    legalAddress: company.legalAddress,
    bankName: company.bankName,
    bankBik: company.bankBik,
    bankAccount: company.bankAccount,
    correspondentAccount: company.correspondentAccount,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    companyId: subscription.companyId,
    plan: subscription.plan,
    status: subscription.status,
    startsAt: subscription.startsAt.toISOString(),
    endsAt: subscription.endsAt.toISOString(),
    reason: subscription.reason,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = value[key];
        return acc;
      }, {}),
  );
}

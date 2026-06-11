import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CompanyStatus, NotificationCategory, Prisma, SubscriptionStatus } from "@prisma/client";
import type {
  AddressDto,
  CompanyProfileUpdateDto,
  ManualSubscriptionDto,
  SelfSubscriptionDto,
} from "@ecoplatform/shared";
import { computeDiff } from "../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../common/pagination";
import { swallowAndLog } from "../common/silent-catch";
import { AddressGeocoderService } from "../geo/address-geocoder.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import {
  addDays,
  hashManualSubscriptionRequest,
  hashSelfSubscriptionRequest,
  isCompanySubscriptionCurrentlyActive,
  isUniqueConstraintError,
  normalizeIdempotencyKey,
  replayManualSubscription,
  serializeCompany,
  serializeSubscription,
  type ManualSubscriptionResponse,
} from "./billing-subscription.helpers";
import {
  composeFormattedAddress,
  normaliseOptionalString,
  upsertCompanyAddress,
  type CompanyAddressGeo,
} from "./billing-company.helpers";

const MANUAL_SUBSCRIPTION_ENDPOINT = "POST /api/admin/billing/manual-subscriptions";
const MANUAL_SUBSCRIPTION_ACTION = "manual_subscription_activation";
const SELF_SUBSCRIPTION_ENDPOINT = "POST /api/billing/subscriptions";
const SELF_SUBSCRIPTION_ACTION = "self_subscription_activation";
const SELF_SUBSCRIPTION_DAYS = 30;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sessionCache: SessionCacheService,
    private readonly geocoder: AddressGeocoderService,
  ) {}

  private async resolveCompanyAddressGeo(address: AddressDto): Promise<CompanyAddressGeo | null> {
    const formatted = address.formatted?.trim() || composeFormattedAddress(address);
    const result = await this.geocoder.geocode(formatted);
    if (!result) {
      return null;
    }

    return {
      latitude: new Prisma.Decimal(result.lat),
      longitude: new Prisma.Decimal(result.lon),
      region: address.region?.trim() || result.region,
    };
  }

  async getOwnStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 5 },
        // Адреса подгружаем как relation'ы — UI /account → Компания их
        // показывает (см. BillingStatus.factualAddress / structuredLegalAddress).
        factualAddress: true,
        structuredLegalAddress: true,
      },
    });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    return company;
  }

  // PATCH /api/billing/company — обновление профиля компании текущим
  // пользователем (а не админом). Все поля опциональные, не передал —
  // не меняется. Адреса сохраняются как relation'ы Company → Address:
  // если приходит объект, создаём/обновляем строку в Address и
  // присваиваем factualAddressId/structuredLegalAddressId. null — отвязываем.
  async updateOwnProfile(companyId: string, input: CompanyProfileUpdateDto) {
    const existing = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, factualAddressId: true, structuredLegalAddressId: true },
    });
    if (!existing) {
      throw new NotFoundException("Компания не найдена.");
    }

    const factualAddressGeo = input.factualAddress ? await this.resolveCompanyAddressGeo(input.factualAddress) : null;

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.CompanyUpdateInput = {};

      if (input.organizationName !== undefined) data.organizationName = input.organizationName;
      if (input.websiteUrl !== undefined) data.websiteUrl = normaliseOptionalString(input.websiteUrl);
      if (input.corporatePhone !== undefined) data.corporatePhone = normaliseOptionalString(input.corporatePhone);
      if (input.corporateEmail !== undefined) data.corporateEmail = normaliseOptionalString(input.corporateEmail);
      if (input.about !== undefined) data.about = normaliseOptionalString(input.about);
      if (input.contactPersonName !== undefined)
        data.contactPersonName = normaliseOptionalString(input.contactPersonName);
      if (input.contactPersonPhone !== undefined)
        data.contactPersonPhone = normaliseOptionalString(input.contactPersonPhone);
      if (input.contactPersonEmail !== undefined)
        data.contactPersonEmail = normaliseOptionalString(input.contactPersonEmail);
      if (input.billingInn !== undefined) data.billingInn = normaliseOptionalString(input.billingInn);
      if (input.billingKpp !== undefined) data.billingKpp = normaliseOptionalString(input.billingKpp);
      if (input.bankName !== undefined) data.bankName = normaliseOptionalString(input.bankName);
      if (input.bankBik !== undefined) data.bankBik = normaliseOptionalString(input.bankBik);
      if (input.bankAccount !== undefined) data.bankAccount = normaliseOptionalString(input.bankAccount);
      if (input.correspondentAccount !== undefined) {
        data.correspondentAccount = normaliseOptionalString(input.correspondentAccount);
      }

      if (input.factualAddress !== undefined) {
        const addressId = await upsertCompanyAddress(
          tx,
          existing.factualAddressId,
          input.factualAddress,
          factualAddressGeo,
        );
        data.factualAddress = addressId ? { connect: { id: addressId } } : { disconnect: true };
      }
      if (input.structuredLegalAddress !== undefined) {
        const addressId = await upsertCompanyAddress(
          tx,
          existing.structuredLegalAddressId,
          input.structuredLegalAddress,
        );
        data.structuredLegalAddress = addressId ? { connect: { id: addressId } } : { disconnect: true };
        // Старое текстовое legalAddress синхронизируем с новой `formatted`
        // строкой — оставляем работоспособной существующую UI-ленту.
        if (input.structuredLegalAddress) {
          const formatted =
            input.structuredLegalAddress.formatted ?? composeFormattedAddress(input.structuredLegalAddress);
          data.legalAddress = formatted;
        } else {
          data.legalAddress = null;
        }
      }

      const updated = await tx.company.update({
        where: { id: companyId },
        data,
        include: {
          subscriptions: { orderBy: { createdAt: "desc" }, take: 5 },
          factualAddress: true,
          structuredLegalAddress: true,
        },
      });

      return updated;
    });
  }

  async listCompanies(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 200 });

    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.company.findMany({
        orderBy: { createdAt: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
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

    return paginatedResponse(items, total, pagination);
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
    await this.sessionCache.invalidateCompany(input.companyId);

    // Уведомляем всех пользователей компании — симметрично уведомлениям о
    // скором/состоявшемся истечении подписки, чтобы биллинг-канал был полным.
    await this.notifyManualActivation(input, result);

    return result;
  }

  async activateSelf(
    input: SelfSubscriptionDto,
    actorId: string,
    companyId: string,
    idempotencyKey: string | undefined,
  ): Promise<ManualSubscriptionResponse> {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const requestHash = hashSelfSubscriptionRequest(input, companyId);

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
    });
    if (existing) {
      return replayManualSubscription(existing, requestHash);
    }

    const result = await this.createSelfSubscriptionWithIdempotency(input, actorId, companyId, key, requestHash);
    await this.sessionCache.invalidateCompany(companyId);
    await this.notifySelfActivation(input, result);

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
            payload: auditPayload as Prisma.InputJsonValue,
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

  private async createSelfSubscriptionWithIdempotency(
    input: SelfSubscriptionDto,
    actorId: string,
    companyId: string,
    key: string,
    requestHash: string,
  ): Promise<ManualSubscriptionResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
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
            payload: auditPayload as Prisma.InputJsonValue,
          },
        });

        const response = {
          company: serializeCompany(updatedCompany),
          subscription: serializeSubscription(subscription),
        };

        await tx.idempotencyKey.update({
          where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
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
          where: { key_endpoint_actorId: { key, endpoint: SELF_SUBSCRIPTION_ENDPOINT, actorId } },
        });
        if (existing) {
          return replayManualSubscription(existing, requestHash);
        }
      }

      throw error;
    }
  }

  private async notifySelfActivation(input: SelfSubscriptionDto, result: ManualSubscriptionResponse): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { companyId: result.company.id },
      select: { id: true },
    });
    const planLabel = input.plan === "basic" ? "Базовая" : "Расширенная";
    await Promise.all(
      users.map((user) =>
        this.notifications
          .createInApp({
            userId: user.id,
            eventType: "billing.subscription.activated",
            sourceId: result.subscription.id,
            category: NotificationCategory.billing,
            title: "Подписка активирована",
            body: `${planLabel} подписка активирована до ${new Date(result.subscription.endsAt).toLocaleString("ru-RU")}.`,
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
}

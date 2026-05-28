import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "crypto";
import { CompanyStatus, NotificationCategory, Prisma, SubscriptionStatus } from "@prisma/client";
import type { Company, Subscription } from "@prisma/client";
import type { AddressDto, CompanyProfileUpdateDto, ManualSubscriptionDto } from "@ecoplatform/shared";
import { computeDiff } from "../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../common/pagination";
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
        const addressId = await upsertCompanyAddress(tx, existing.factualAddressId, input.factualAddress);
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

// Пустую строку из формы трактуем как «очистить». Trim'аем заранее в Zod-схеме,
// поэтому здесь только пробрасываем undefined/null/непустую строку.
function normaliseOptionalString(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Если у Company уже есть Address — обновляем строку (адрес меняется, id остаётся);
// иначе создаём новую. Если входной address=null — возвращаем null (Company.update
// сделает disconnect; orphaned Address остаётся в БД до отдельной очистки, потому
// что в будущем эту запись могут переиспользовать).
async function upsertCompanyAddress(
  tx: Prisma.TransactionClient,
  existingAddressId: string | null,
  address: AddressDto | null | undefined,
): Promise<string | null> {
  if (!address) {
    return null;
  }

  const formatted = address.formatted?.trim() || composeFormattedAddress(address);
  const data = {
    country: address.country?.trim() || "Россия",
    region: address.region?.trim() || null,
    city: address.city.trim(),
    street: address.street?.trim() || null,
    building: address.building?.trim() || null,
    apartment: address.apartment?.trim() || null,
    postcode: address.postcode?.trim() || null,
    formatted,
    source: "manual",
  };

  if (existingAddressId) {
    const updated = await tx.address.update({ where: { id: existingAddressId }, data });
    return updated.id;
  }
  const created = await tx.address.create({ data });
  return created.id;
}

// Собирает одну строку адреса из полей. Используется когда пользователь
// не указал `formatted` явно. Порядок — как принято в России:
// индекс, регион, город, улица, дом, квартира.
function composeFormattedAddress(address: AddressDto): string {
  const parts = [
    address.postcode,
    address.region,
    address.city,
    address.street ? `ул. ${address.street}` : null,
    address.building ? `д. ${address.building}` : null,
    address.apartment ? `кв. ${address.apartment}` : null,
  ]
    .map((part) => part?.toString().trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(", ");
}

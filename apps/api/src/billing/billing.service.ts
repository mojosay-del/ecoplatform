import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AddressDto,
  CompanyProfileUpdateDto,
  ManualSubscriptionDto,
  SelfSubscriptionDto,
} from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../common/pagination";
import { AddressGeocoderService } from "../geo/address-geocoder.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import {
  createManualSubscriptionActivation,
  createSelfSubscriptionActivation,
  createSelfTrialActivation,
  notifyManualActivation,
  notifySelfActivation,
} from "./billing-activation.helpers";
import {
  hashManualSubscriptionRequest,
  hashSelfSubscriptionRequest,
  hashTrialActivationRequest,
  normalizeIdempotencyKey,
  type ManualSubscriptionResponse,
} from "./billing-subscription.helpers";
import {
  composeFormattedAddress,
  normaliseOptionalString,
  toBillingStatus,
  upsertCompanyAddress,
  type CompanyAddressGeo,
} from "./billing-company.helpers";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sessionCache: SessionCacheService,
    private readonly geocoder: AddressGeocoderService,
    private readonly settings: PlatformSettingsService,
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

    return toBillingStatus(company);
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

      return toBillingStatus(updated);
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

    const result = await createManualSubscriptionActivation(this.prisma, input, actorId, key, requestHash);
    await this.sessionCache.invalidateCompany(input.companyId);

    // Уведомляем всех пользователей компании — симметрично уведомлениям о
    // скором/состоявшемся истечении подписки, чтобы биллинг-канал был полным.
    await notifyManualActivation(this.prisma, this.notifications, input, result);

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

    const result = await createSelfSubscriptionActivation(this.prisma, input, actorId, companyId, key, requestHash);
    await this.sessionCache.invalidateCompany(companyId);
    await notifySelfActivation(this.prisma, this.notifications, input, result);

    return result;
  }

  async activateTrial(actorId: string, companyId: string, idempotencyKey: string | undefined) {
    const trialEnabled = await this.settings.getValue("demo.enabled");
    if (!trialEnabled) {
      throw new ForbiddenException("Пробный доступ временно недоступен.");
    }

    const key = normalizeIdempotencyKey(idempotencyKey);
    const requestHash = hashTrialActivationRequest(companyId);
    const durationHours = await this.settings.getValue("demo.duration_hours");

    const result = await createSelfTrialActivation(this.prisma, actorId, companyId, key, requestHash, durationHours);
    await this.sessionCache.invalidateCompany(companyId);

    return result;
  }
}

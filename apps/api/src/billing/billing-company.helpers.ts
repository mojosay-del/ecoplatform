import { Prisma } from "@prisma/client";
import type { AddressDto, BillingStatus, CompanyAddress } from "@ecoplatform/shared";

export type BillingStatusCompany = Prisma.CompanyGetPayload<{
  include: {
    subscriptions: true;
    factualAddress: true;
    structuredLegalAddress: true;
  };
}>;

export type CompanyAddressGeo = {
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  region: string | null;
};

// Пустую строку из формы трактуем как «очистить». Trim'аем заранее в Zod-схеме,
// поэтому здесь только пробрасываем undefined/null/непустую строку.
export function normaliseOptionalString(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toCompanyAddress(address: BillingStatusCompany["factualAddress"]): CompanyAddress | null {
  if (!address) {
    return null;
  }

  return {
    id: address.id,
    country: address.country,
    region: address.region,
    city: address.city,
    street: address.street,
    building: address.building,
    apartment: address.apartment,
    postcode: address.postcode,
    latitude: address.latitude?.toString() ?? null,
    longitude: address.longitude?.toString() ?? null,
    formatted: address.formatted,
    source: address.source,
  };
}

export function toBillingStatus(company: BillingStatusCompany): BillingStatus {
  return {
    id: company.id,
    organizationName: company.organizationName,
    type: company.type,
    status: company.status,
    subscriptionPlan: company.subscriptionPlan,
    subscriptionEndsAt: toIsoDate(company.subscriptionEndsAt),
    demoEndsAt: toIsoDate(company.demoEndsAt),
    billingInn: company.billingInn,
    billingKpp: company.billingKpp,
    legalAddress: company.legalAddress,
    bankName: company.bankName,
    bankBik: company.bankBik,
    bankAccount: company.bankAccount,
    correspondentAccount: company.correspondentAccount,
    websiteUrl: company.websiteUrl,
    corporatePhone: company.corporatePhone,
    corporateEmail: company.corporateEmail,
    about: company.about,
    contactPersonName: company.contactPersonName,
    contactPersonPhone: company.contactPersonPhone,
    contactPersonEmail: company.contactPersonEmail,
    factualAddress: toCompanyAddress(company.factualAddress),
    structuredLegalAddress: toCompanyAddress(company.structuredLegalAddress),
    subscriptions: company.subscriptions.map((subscription) => ({
      id: subscription.id,
      companyId: subscription.companyId,
      plan: subscription.plan,
      status: subscription.status,
      startsAt: subscription.startsAt.toISOString(),
      endsAt: subscription.endsAt.toISOString(),
      reason: subscription.reason,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    })),
  };
}

// Если у Company уже есть Address — обновляем строку (адрес меняется, id остаётся);
// иначе создаём новую. Если входной address=null — возвращаем null (Company.update
// сделает disconnect; orphaned Address остаётся в БД до отдельной очистки, потому
// что в будущем эту запись могут переиспользовать).
export async function upsertCompanyAddress(
  tx: Prisma.TransactionClient,
  existingAddressId: string | null,
  address: AddressDto | null | undefined,
  geo: CompanyAddressGeo | null = null,
): Promise<string | null> {
  if (!address) {
    return null;
  }

  const formatted = address.formatted?.trim() || composeFormattedAddress(address);
  const region = geo?.region ?? address.region?.trim() ?? null;
  const data = {
    country: address.country?.trim() || "Россия",
    region,
    city: address.city.trim(),
    street: address.street?.trim() || null,
    building: address.building?.trim() || null,
    apartment: address.apartment?.trim() || null,
    postcode: address.postcode?.trim() || null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
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
export function composeFormattedAddress(address: AddressDto): string {
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

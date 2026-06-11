import { Prisma } from "@prisma/client";
import type {
  AddressDto,
  CompanyAddress,
  MarketplaceListingDetail,
  MarketplaceListingListItem,
  MarketplaceListingPositionSummary,
  MyMarketplaceListingItem,
} from "@ecoplatform/shared";

// Единый include для объявления: адрес, позиции (с названием номенклатуры),
// медиа и тип компании-продавца. Используется во всех выборках, чтобы мапперы
// получали один и тот же набор связей.
export const listingInclude = {
  address: true,
  positions: {
    orderBy: { position: "asc" },
    include: { nomenclature: { select: { name: true, category: { select: { slug: true } } } } },
  },
  media: { orderBy: { position: "asc" } },
  sellerCompany: {
    select: {
      id: true,
      type: true,
      organizationName: true,
      marketplaceRating: { select: { overall: true, reviewCount: true } },
    },
  },
} satisfies Prisma.MarketplaceListingInclude;

export type ListingWithRelations = Prisma.MarketplaceListingGetPayload<{ include: typeof listingInclude }>;

function decimalToNumberOrNull(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function photoCount(media: ListingWithRelations["media"]): number {
  return media.filter((item) => item.kind === "photo").length;
}

function coverFileId(media: ListingWithRelations["media"]): string | null {
  return media.find((item) => item.kind === "photo")?.fileId ?? null;
}

// Рейтинг компании для карточек: показываем число только при наличии отзывов
// (иначе «Рейтинг отсутствует» → null), несмотря на служебный старт-5★ в кэше.
export function companyRating(rating: { overall: Prisma.Decimal; reviewCount: number } | null): number | null {
  return rating && rating.reviewCount > 0 ? Number(rating.overall) : null;
}

function positionSummaries(listing: ListingWithRelations): MarketplaceListingPositionSummary[] {
  return listing.positions.map((position) => ({
    nomenclatureId: position.nomenclatureId,
    nomenclatureName: position.nomenclature.name,
    categorySlug: position.nomenclature.category.slug,
    weightKg: Number(position.weightKg),
    form: position.form,
  }));
}

function aggregatePositionPackaging(positions: ListingWithRelations["positions"]): string | null {
  const items = positions
    .flatMap((position) => (position.packaging ?? "").split(","))
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(items));
  return unique.length > 0 ? unique.join(", ") : null;
}

export function mapToListItem(listing: ListingWithRelations): MarketplaceListingListItem {
  return {
    id: listing.id,
    status: listing.status,
    city: listing.address.city,
    region: listing.address.region,
    circleLat: listing.circleLat === null ? null : Number(listing.circleLat),
    circleLon: listing.circleLon === null ? null : Number(listing.circleLon),
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    photoCount: photoCount(listing.media),
    coverFileId: coverFileId(listing.media),
    sellerType: listing.sellerCompany.type,
    sellerRating: companyRating(listing.sellerCompany.marketplaceRating),
    positions: positionSummaries(listing),
  };
}

export function mapToMyItem(listing: ListingWithRelations): MyMarketplaceListingItem {
  return {
    id: listing.id,
    status: listing.status,
    city: listing.address.city,
    region: listing.address.region,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    archiveReason: listing.archiveReason,
    photoCount: photoCount(listing.media),
    coverFileId: coverFileId(listing.media),
    positions: positionSummaries(listing),
  };
}

function toCompanyAddress(address: ListingWithRelations["address"]): CompanyAddress {
  return {
    id: address.id,
    country: address.country,
    region: address.region,
    city: address.city,
    street: address.street,
    building: address.building,
    apartment: address.apartment,
    postcode: address.postcode,
    latitude: address.latitude === null ? null : address.latitude.toString(),
    longitude: address.longitude === null ? null : address.longitude.toString(),
    formatted: address.formatted,
    source: address.source,
  };
}

// `canSeeContacts` — раскрываем ли точный адрес и телефон. Пока это только
// владелец и админ; на фазе предложений сюда добавится покупатель после акцепта.
// `canSeeContacts` — раскрываем ли точные адрес/телефон (владелец, админ; позже —
// покупатель после акцепта). `isOwner` — ТОЛЬКО владелец (компания продавца): по
// нему фронт показывает действия редактирования. Раньше эти понятия были слиты,
// из-за чего админ/покупатель-после-акцепта видели «Редактировать».
export function mapToDetail(
  listing: ListingWithRelations,
  options: { canSeeContacts: boolean; isOwner: boolean; sellerGender?: string | null },
): MarketplaceListingDetail {
  return {
    id: listing.id,
    status: listing.status,
    seller: {
      companyId: listing.sellerCompany.id,
      name: listing.sellerCompany.organizationName,
      type: listing.sellerCompany.type,
      rating: companyRating(listing.sellerCompany.marketplaceRating),
      avatarUrl: resolveSellerAvatarUrl(listing.sellerCompany.type, options.sellerGender),
    },
    city: listing.address.city,
    region: listing.address.region,
    address: options.canSeeContacts ? toCompanyAddress(listing.address) : null,
    contactPhone: options.canSeeContacts ? listing.contactPhone : null,
    description: listing.description,
    packaging: aggregatePositionPackaging(listing.positions),
    paymentTerms: listing.paymentTerms,
    typicalLoadKg: decimalToNumberOrNull(listing.typicalLoadKg),
    readyNow: listing.readyNow,
    readinessDate: listing.readinessDate?.toISOString() ?? null,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    expiresAt: listing.expiresAt?.toISOString() ?? null,
    archiveReason: listing.archiveReason,
    positions: listing.positions.map((position) => ({
      id: position.id,
      nomenclatureId: position.nomenclatureId,
      nomenclatureName: position.nomenclature.name,
      categorySlug: position.nomenclature.category.slug,
      weightKg: Number(position.weightKg),
      form: position.form,
      packaging: position.packaging,
      moistureCondition:
        position.moistureCondition as MarketplaceListingDetail["positions"][number]["moistureCondition"],
      contaminationCondition:
        position.contaminationCondition as MarketplaceListingDetail["positions"][number]["contaminationCondition"],
    })),
    media: listing.media.map((item) => ({
      id: item.id,
      fileId: item.fileId,
      kind: item.kind,
      position: item.position,
    })),
    isOwner: options.isOwner,
  };
}

function resolveSellerAvatarUrl(companyType: string, gender: string | null | undefined): string | null {
  const companyPrefix = companyAvatarPrefixByType[companyType];
  const suffix = gender ? avatarSuffixByGender[gender] : null;
  return companyPrefix && suffix ? `/avatars/company/${companyPrefix}${suffix}.png` : null;
}

const companyAvatarPrefixByType: Record<string, string> = {
  collector: "z",
  trader: "t",
  processor: "p",
};

const avatarSuffixByGender: Record<string, string> = {
  male: "man",
  female: "woman",
};

// Готовит данные Address для снимка адреса объявления. formatted собирается из
// полей, если не передан явно (как в billing-company.helpers, но без upsert —
// у объявления свой адрес-снимок).
export function buildAddressCreateData(address: AddressDto) {
  const formatted = address.formatted?.trim() || composeFormatted(address);
  return {
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
}

function composeFormatted(address: AddressDto): string {
  return [
    address.postcode,
    address.region,
    address.city,
    address.street ? `ул. ${address.street}` : null,
    address.building ? `д. ${address.building}` : null,
    address.apartment ? `кв. ${address.apartment}` : null,
  ]
    .map((part) => part?.toString().trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

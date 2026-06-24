import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LISTING_LIFETIME_DAYS,
  LISTING_MAX_PHOTOS,
  LISTING_MAX_VIDEOS,
  LISTING_MIN_PHOTOS,
  LISTING_MIN_WEIGHT_KG,
  type ListingMediaInput,
  type ListingPositionInput,
} from "@ecoplatform/shared";
import { type AddressGeocoderService, dadataCountryFromName } from "../../geo/address-geocoder.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { MarketplaceFeedBbox } from "../marketplace.schemas";
import { generateCircleCenter } from "./marketplace-geo.helpers";
import { buildAddressCreateData, type ListingWithRelations } from "./marketplace-listings.helpers";

export const LISTING_FILE_ENTITY = "marketplace_listing";
const DAY_MS = 24 * 60 * 60 * 1000;
export const LISTING_LIFETIME_MS = LISTING_LIFETIME_DAYS * DAY_MS;

export type ListParams = { limit?: number; offset?: number };
export type FeedParams = ListParams & { region?: string[]; nomenclatureId?: string[]; bbox?: MarketplaceFeedBbox };

type AddressCreateData = ReturnType<typeof buildAddressCreateData>;
type AddressGeo = {
  coords: { latitude?: Prisma.Decimal; longitude?: Prisma.Decimal; region?: string | null };
  circleLat: Prisma.Decimal | null;
  circleLon: Prisma.Decimal | null;
};

export async function resolveListingAddressGeo(
  geocoder: AddressGeocoderService,
  addressData: AddressCreateData,
): Promise<AddressGeo> {
  const result = await geocoder.geocode(addressData.formatted, dadataCountryFromName(addressData.country));
  if (!result) {
    return { coords: {}, circleLat: null, circleLon: null };
  }
  const center = generateCircleCenter(result.lat, result.lon);
  return {
    coords: {
      latitude: new Prisma.Decimal(result.lat),
      longitude: new Prisma.Decimal(result.lon),
      region: result.region ?? addressData.region,
    },
    circleLat: new Prisma.Decimal(center.lat),
    circleLon: new Prisma.Decimal(center.lon),
  };
}

export async function resolveStoredOrFreshListingAddressGeo(
  geocoder: AddressGeocoderService,
  addressData: AddressCreateData,
  stored: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
): Promise<AddressGeo> {
  if (stored.latitude !== null && stored.longitude !== null) {
    const center = generateCircleCenter(Number(stored.latitude), Number(stored.longitude));
    return {
      coords: { latitude: stored.latitude, longitude: stored.longitude },
      circleLat: new Prisma.Decimal(center.lat),
      circleLon: new Prisma.Decimal(center.lon),
    };
  }

  return resolveListingAddressGeo(geocoder, addressData);
}

export function listingFeedWhere(params: FeedParams): Prisma.MarketplaceListingWhereInput {
  return {
    status: "active",
    ...(params.region && params.region.length ? { address: { region: { in: params.region } } } : {}),
    ...(params.nomenclatureId && params.nomenclatureId.length
      ? { positions: { some: { nomenclatureId: { in: params.nomenclatureId } } } }
      : {}),
    ...(params.bbox ? bboxWhere(params.bbox) : {}),
  };
}

export function assertListingPublishable(listing: ListingWithRelations) {
  const totalWeight = listing.positions.reduce((sum, position) => sum + Number(position.weightKg), 0);
  if (totalWeight < LISTING_MIN_WEIGHT_KG) {
    throw new BadRequestException(`Суммарный вес объявления — не меньше ${LISTING_MIN_WEIGHT_KG} кг.`);
  }

  const photos = listing.media.filter((item) => item.kind === "photo").length;
  const videos = listing.media.filter((item) => item.kind === "video").length;
  if (photos < LISTING_MIN_PHOTOS || photos > LISTING_MAX_PHOTOS) {
    throw new BadRequestException(`Нужно от ${LISTING_MIN_PHOTOS} до ${LISTING_MAX_PHOTOS} фотографий.`);
  }
  if (videos > LISTING_MAX_VIDEOS) {
    throw new BadRequestException(`Не больше ${LISTING_MAX_VIDEOS} видео.`);
  }

  if (!listing.readyNow) {
    if (!listing.readinessDate) {
      throw new BadRequestException("Укажите дату готовности или отметьте «готово сейчас».");
    }
    const maxDate = new Date(Date.now() + LISTING_LIFETIME_MS);
    if (listing.readinessDate.getTime() > maxDate.getTime()) {
      throw new BadRequestException(`Дата готовности — не дальше ${LISTING_LIFETIME_DAYS} дней.`);
    }
  }
}

export async function assertListingNomenclatureValid(prisma: PrismaService, ids: string[]) {
  const unique = Array.from(new Set(ids));
  const found = await prisma.nomenclature.count({ where: { id: { in: unique }, isActive: true } });
  if (found !== unique.length) {
    throw new BadRequestException("В позициях указана неизвестная номенклатура.");
  }
}

export async function assertListingMediaValid(prisma: PrismaService, media: ListingMediaInput[]) {
  if (media.length === 0) return;
  const photos = media.filter((item) => item.kind === "photo").length;
  const videos = media.filter((item) => item.kind === "video").length;
  if (photos > LISTING_MAX_PHOTOS) {
    throw new BadRequestException(`Не больше ${LISTING_MAX_PHOTOS} фотографий.`);
  }
  if (videos > LISTING_MAX_VIDEOS) {
    throw new BadRequestException(`Не больше ${LISTING_MAX_VIDEOS} видео.`);
  }
  const ids = Array.from(new Set(media.map((item) => item.fileId)));
  const found = await prisma.fileAsset.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw new BadRequestException("Некоторые прикреплённые файлы не найдены.");
  }
}

export function listingOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function listingPatchOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return listingOptionalText(value);
}

export function listingPositionCreateData(positions: ListingPositionInput[]) {
  return positions.map((position, index) => ({
    nomenclatureId: position.nomenclatureId,
    position: index,
    weightKg: new Prisma.Decimal(position.weightKg),
    form: position.form,
    packaging: listingOptionalText(position.packaging),
    moistureCondition: position.moistureCondition ?? null,
    contaminationCondition: position.contaminationCondition ?? null,
  }));
}

export function listingMediaCreateData(media: ListingMediaInput[]) {
  return media.map((item, index) => ({ fileId: item.fileId, kind: item.kind, position: index }));
}

export function addressCreateDataFromSource(address: ListingWithRelations["address"]): AddressCreateData {
  return {
    country: address.country,
    region: address.region,
    city: address.city,
    street: address.street,
    building: address.building,
    apartment: address.apartment,
    postcode: address.postcode,
    formatted: address.formatted,
    source: address.source,
  };
}

export async function archiveExpiredListings(prisma: PrismaService, now = new Date()): Promise<number> {
  const expiring = await prisma.marketplaceListing.findMany({
    where: {
      status: "active",
      expiresAt: { lt: now },
      offers: { none: { status: "accepted", dealResult: null } },
    },
    select: { id: true },
  });
  if (expiring.length === 0) return 0;

  const ids = expiring.map((listing) => listing.id);
  await prisma.$transaction([
    prisma.marketplaceListing.updateMany({
      where: { id: { in: ids } },
      data: { status: "archived", archivedAt: now, archiveReason: "expired" },
    }),
    prisma.offer.updateMany({
      where: { listingId: { in: ids }, status: "active" },
      data: { status: "declined", resolvedAt: now },
    }),
  ]);
  return ids.length;
}

// Условие «центр круга внутри видимой области карты». NULL-координаты
// (негеокодированный адрес) не проходят сравнение и отсекаются сами.
function bboxWhere(bbox: MarketplaceFeedBbox): Prisma.MarketplaceListingWhereInput {
  const latWhere: Prisma.MarketplaceListingWhereInput = { circleLat: { gte: bbox.south, lte: bbox.north } };
  if (bbox.west <= bbox.east) {
    return { ...latWhere, circleLon: { gte: bbox.west, lte: bbox.east } };
  }
  // Запад > востока — окно пересекает антимеридиан (Чукотка): долгота двумя ветками.
  return { AND: [latWhere, { OR: [{ circleLon: { gte: bbox.west } }, { circleLon: { lte: bbox.east } }] }] };
}

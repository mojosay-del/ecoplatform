import { Prisma } from "@prisma/client";
import type { ListingOfferItem, MyOfferItem, OfferPositionView } from "@ecoplatform/shared";

// Единый include для предложения: позиции (с названием номенклатуры),
// компания-покупатель и объявление (продавец, контакты, позиции для сводки).
export const offerInclude = {
  positions: {
    orderBy: { listingPosition: { position: "asc" } },
    include: { listingPosition: { select: { id: true, nomenclature: { select: { name: true } } } } },
  },
  buyerCompany: { select: { id: true, organizationName: true } },
  listing: {
    select: {
      id: true,
      sellerCompanyId: true,
      createdById: true,
      status: true,
      contactPhone: true,
      sellerCompany: { select: { organizationName: true } },
      address: { select: { city: true, formatted: true } },
      positions: { orderBy: { position: "asc" }, select: { id: true, nomenclature: { select: { name: true } } } },
    },
  },
} satisfies Prisma.OfferInclude;

export type OfferWithRelations = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

function offerPositionViews(offer: OfferWithRelations): OfferPositionView[] {
  return offer.positions.map((position) => ({
    listingPositionId: position.listingPositionId,
    nomenclatureName: position.listingPosition.nomenclature.name,
    // null = «не интересует» эту позицию.
    pricePerKg: position.pricePerKg === null ? null : Number(position.pricePerKg),
  }));
}

function listingSummary(offer: OfferWithRelations): string {
  return offer.listing.positions.map((position) => position.nomenclature.name).join(", ");
}

// Контакты раскрываются обеим сторонам только после акцепта и остаются
// раскрытыми после (стороны уже обменялись данными).
export function toMyOfferItem(offer: OfferWithRelations): MyOfferItem {
  const revealed = offer.acceptedAt !== null;
  return {
    id: offer.id,
    listingId: offer.listingId,
    listingSummary: listingSummary(offer),
    status: offer.status,
    priceCondition: offer.priceCondition,
    city: offer.city,
    positions: offerPositionViews(offer),
    createdAt: offer.createdAt.toISOString(),
    acceptedAt: offer.acceptedAt?.toISOString() ?? null,
    dealResult: offer.dealResult,
    sellerContact: revealed
      ? {
          companyName: offer.listing.sellerCompany.organizationName,
          phone: offer.listing.contactPhone,
          city: offer.listing.address.city,
        }
      : null,
  };
}

export function toListingOfferItem(offer: OfferWithRelations): ListingOfferItem {
  const revealed = offer.acceptedAt !== null;
  return {
    id: offer.id,
    status: offer.status,
    priceCondition: offer.priceCondition,
    city: offer.city,
    positions: offerPositionViews(offer),
    // Рейтинг покупателя — фаза отзывов.
    buyerRating: null,
    createdAt: offer.createdAt.toISOString(),
    acceptedAt: offer.acceptedAt?.toISOString() ?? null,
    decisionDeadline: offer.decisionDeadline?.toISOString() ?? null,
    dealResult: offer.dealResult,
    buyerContact: revealed
      ? { companyName: offer.buyerCompany.organizationName, phone: offer.contactPhone, city: offer.city }
      : null,
  };
}

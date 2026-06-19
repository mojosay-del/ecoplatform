import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationCategory, Prisma } from "@prisma/client";
import type { CreateOfferDto } from "@ecoplatform/shared";
import type { AddressGeocoderService } from "../../geo/address-geocoder.service";
import type { NotificationsService } from "../../notifications/notifications.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { swallowAndLog } from "../../common/silent-catch";
import { type OfferWithRelations, offerInclude } from "./marketplace-offers.helpers";

const DECISION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CREATE_OFFER_TRANSACTION_RETRIES = 3;
const DUPLICATE_ACTIVE_OFFER_MESSAGE = "У вас уже есть активное предложение по этому объявлению — измените его.";

export function assertOfferPositions(dto: CreateOfferDto, listingPositionIds: string[]) {
  const ids = dto.positions.map((position) => position.listingPositionId);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException("В предложении есть дублирующиеся позиции.");
  }
  const allowed = new Set(listingPositionIds);
  if (!ids.every((id) => allowed.has(id))) {
    throw new BadRequestException("Позиция предложения не принадлежит этому объявлению.");
  }
  if (!dto.positions.some((position) => position.pricePerTonRub != null && position.pricePerTonRub > 0)) {
    throw new BadRequestException("Укажите цену хотя бы по одной позиции.");
  }
  if (dto.priceCondition === "at_gate" && !dto.city?.trim()) {
    throw new BadRequestException("Для условия «цена на воротах» укажите город доставки.");
  }
}

export function offerCity(dto: CreateOfferDto): string | null {
  return dto.priceCondition === "at_gate" ? dto.city?.trim() || null : null;
}

export function offerPositionCreateData(dto: CreateOfferDto) {
  return dto.positions.map((position) => ({
    listingPositionId: position.listingPositionId,
    pricePerTonRub: position.pricePerTonRub ?? null,
  }));
}

export async function resolveOfferRegion(
  geocoder: AddressGeocoderService,
  city: string | null,
): Promise<string | null> {
  if (!city) return null;
  const result = await geocoder.geocode(city);
  return result?.region?.trim() || null;
}

export async function createOfferAtomically(
  prisma: PrismaService,
  params: {
    listingId: string;
    buyerCompanyId: string;
    data: Prisma.OfferCreateArgs["data"];
  },
): Promise<OfferWithRelations> {
  let attempts = 0;

  while (true) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.offer.findFirst({
            where: {
              listingId: params.listingId,
              buyerCompanyId: params.buyerCompanyId,
              status: { in: ["active", "accepted"] },
              positions: { some: { pricePerTonRub: { gt: 0 } } },
            },
            select: { id: true },
          });
          if (existing) {
            throw new BadRequestException(DUPLICATE_ACTIVE_OFFER_MESSAGE);
          }

          return tx.offer.create({ data: params.data, include: offerInclude });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      attempts += 1;
      if (!isTransactionWriteConflictError(error) || attempts >= CREATE_OFFER_TRANSACTION_RETRIES) {
        throw error;
      }
    }
  }
}

export async function acceptOfferWithRaceGuard(
  prisma: PrismaService,
  offer: OfferWithRelations,
  now: Date,
): Promise<OfferWithRelations> {
  try {
    return await prisma.$transaction(async (tx) => {
      const pending = await tx.offer.findFirst({
        where: { listingId: offer.listingId, status: "accepted", id: { not: offer.id } },
        select: { id: true },
      });
      if (pending) {
        throw new BadRequestException("По объявлению уже есть принятое предложение, ожидающее решения.");
      }

      const accepted = await tx.offer.updateMany({
        where: { id: offer.id, status: "active" },
        data: { status: "accepted", acceptedAt: now, decisionDeadline: new Date(now.getTime() + DECISION_WINDOW_MS) },
      });
      if (accepted.count === 0) {
        throw new BadRequestException("Принять можно только активное предложение.");
      }

      const updated = await tx.offer.findUnique({ where: { id: offer.id }, include: offerInclude });
      if (!updated) {
        throw new NotFoundException("Предложение не найдено.");
      }
      return updated;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new BadRequestException("По объявлению уже есть принятое предложение, ожидающее решения.");
    }
    throw error;
  }
}

export async function autoResolveExpiredOfferAcceptances(
  prisma: PrismaService,
  notifications: NotificationsService,
  now = new Date(),
): Promise<number> {
  const expired = await prisma.offer.findMany({
    where: { status: "accepted", dealResult: null, decisionDeadline: { lt: now } },
    select: { id: true, listingId: true, createdById: true },
  });
  if (expired.length === 0) return 0;

  for (const offer of expired) {
    await prisma.$transaction([
      prisma.offer.update({ where: { id: offer.id }, data: { status: "declined", resolvedAt: now } }),
      prisma.marketplaceListing.update({
        where: { id: offer.listingId },
        data: { status: "archived", archivedAt: now, archiveReason: "not_settled" },
      }),
      prisma.offer.updateMany({
        where: { listingId: offer.listingId, status: "active" },
        data: { status: "declined", resolvedAt: now },
      }),
    ]);
    await notifyMarketplaceOffer(notifications, {
      userId: offer.createdById,
      eventType: "marketplace.deal.timeout",
      title: "Время на решение истекло",
      body: "Продавец не подтвердил сделку за 24 часа. Объявление перемещено в архив.",
      link: "/marketplace/offers",
      sourceId: offer.id,
    });
  }
  return expired.length;
}

export async function notifyMarketplaceOffer(
  notifications: NotificationsService,
  input: { userId: string; eventType: string; title: string; body: string; link: string; sourceId: string },
) {
  await notifications
    .createInApp({ ...input, category: NotificationCategory.marketplace })
    .catch(swallowAndLog(input.eventType, { userId: input.userId, sourceId: input.sourceId }));
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isTransactionWriteConflictError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

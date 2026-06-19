import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateOfferDto,
  type DealDecisionDto,
  type ListingOfferItem,
  type MyOfferItem,
  type PaginatedResponse,
} from "@ecoplatform/shared";
import {
  assertCompanyTypeIn,
  assertFunctionalAccess,
  isListingOwner,
  isPlatformAdmin,
} from "../../common/access-policy";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AddressGeocoderService } from "../../geo/address-geocoder.service";
import { type OfferWithRelations, offerInclude, toListingOfferItem, toMyOfferItem } from "./marketplace-offers.helpers";
import {
  acceptOfferWithRaceGuard,
  assertOfferPositions,
  autoResolveExpiredOfferAcceptances,
  createOfferAtomically,
  notifyMarketplaceOffer,
  offerCity,
  offerPositionCreateData,
  resolveOfferRegion,
} from "./marketplace-offers-workflow.helpers";
type ListParams = { limit?: number; offset?: number };

// Сервис предложений (закрытый аукцион). Покупатель (трейдер/переработчик) шлёт
// закрытое ценовое предложение по позициям объявления; продавец видит ставки
// (имена скрыты), принимает одно → контакты раскрываются, идёт 24ч-окно решения
// «Договорились/Не договорились». Тайм-аут окна архивирует объявление (cron).
@Injectable()
export class MarketplaceOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly geocoder: AddressGeocoderService,
  ) {}

  // ── Гейты ─────────────────────────────────────────────────────────────────

  private assertCanUse(user: RequestUser) {
    assertFunctionalAccess(user, "Доступ к площадке ограничен. Активируйте подписку в кабинете.");
  }

  // Предложения делают покупатели — трейдеры и переработчики (по докам).
  private assertBuyer(user: RequestUser): string {
    this.assertCanUse(user);
    return assertCompanyTypeIn(
      user,
      ["trader", "processor"],
      "Делать предложения могут покупатели — трейдеры и переработчики.",
    );
  }

  private async findOwnOfferOr404(buyerCompanyId: string, offerId: string): Promise<OfferWithRelations> {
    const offer = await this.prisma.offer.findFirst({ where: { id: offerId, buyerCompanyId }, include: offerInclude });
    if (!offer) {
      throw new NotFoundException("Предложение не найдено.");
    }
    return offer;
  }

  // ── Покупатель ──────────────────────────────────────────────────────────

  async createOffer(user: RequestUser, listingId: string, dto: CreateOfferDto): Promise<MyOfferItem> {
    const buyerCompanyId = this.assertBuyer(user);
    // Санкция модерации module_restriction("marketplace") блокирует участие.
    await this.moduleAccess.assertModuleAccess(user.id, "marketplace");
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, sellerCompanyId: true, createdById: true, positions: { select: { id: true } } },
    });
    if (!listing || listing.status !== "active") {
      throw new NotFoundException("Объявление не найдено или неактивно.");
    }
    if (listing.sellerCompanyId === buyerCompanyId) {
      throw new ForbiddenException("Нельзя делать предложение на собственное объявление.");
    }

    assertOfferPositions(
      dto,
      listing.positions.map((position) => position.id),
    );

    const city = offerCity(dto);
    const region = await resolveOfferRegion(this.geocoder, city);
    const offer = await createOfferAtomically(this.prisma, {
      listingId,
      buyerCompanyId,
      data: {
        listingId,
        buyerCompanyId,
        createdById: user.id,
        priceCondition: dto.priceCondition,
        city,
        region,
        contactPhone: dto.contactPhone.trim(),
        positions: { create: offerPositionCreateData(dto) },
      },
    });

    await notifyMarketplaceOffer(this.notifications, {
      userId: listing.createdById,
      eventType: "marketplace.offer.created",
      title: "Новое предложение",
      body: "По вашему объявлению поступило новое ценовое предложение.",
      link: `/marketplace/${listingId}`,
      sourceId: offer.id,
    });
    return toMyOfferItem(offer);
  }

  async updateOffer(user: RequestUser, offerId: string, dto: CreateOfferDto): Promise<MyOfferItem> {
    const buyerCompanyId = this.assertBuyer(user);
    const offer = await this.findOwnOfferOr404(buyerCompanyId, offerId);
    if (offer.listing.status !== "active") {
      throw new BadRequestException("Объявление неактивно.");
    }
    if (offer.status !== "active") {
      throw new BadRequestException("Изменить можно только активное предложение (до его принятия).");
    }
    assertOfferPositions(
      dto,
      offer.listing.positions.map((position) => position.id),
    );

    const city = offerCity(dto);
    const region = await resolveOfferRegion(this.geocoder, city);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.offerPosition.deleteMany({ where: { offerId } });
      await tx.offerPosition.createMany({
        data: offerPositionCreateData(dto).map((position) => ({ ...position, offerId })),
      });
      return tx.offer.update({
        where: { id: offerId },
        data: {
          priceCondition: dto.priceCondition,
          city,
          region,
          contactPhone: dto.contactPhone.trim(),
        },
        include: offerInclude,
      });
    });

    await notifyMarketplaceOffer(this.notifications, {
      userId: offer.listing.createdById,
      eventType: "marketplace.offer.updated",
      title: "Предложение изменено",
      body: "Покупатель изменил предложение по вашему объявлению.",
      link: `/marketplace/${offer.listingId}`,
      sourceId: offerId,
    });
    return toMyOfferItem(updated);
  }

  async withdrawOffer(user: RequestUser, offerId: string): Promise<MyOfferItem> {
    const buyerCompanyId = this.assertBuyer(user);
    const offer = await this.findOwnOfferOr404(buyerCompanyId, offerId);
    if (offer.status !== "active") {
      throw new BadRequestException("Отозвать можно только активное предложение.");
    }
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: "withdrawn", resolvedAt: new Date() },
      include: offerInclude,
    });
    await notifyMarketplaceOffer(this.notifications, {
      userId: offer.listing.createdById,
      eventType: "marketplace.offer.withdrawn",
      title: "Предложение отозвано",
      body: "Покупатель отозвал предложение по вашему объявлению.",
      link: `/marketplace/${offer.listingId}`,
      sourceId: offerId,
    });
    return toMyOfferItem(updated);
  }

  async listMyOffers(user: RequestUser, params: ListParams): Promise<PaginatedResponse<MyOfferItem>> {
    const buyerCompanyId = this.assertBuyer(user);
    const { limit, offset } = resolvePagination(params, { defaultLimit: 20, maxLimit: 100 });
    const where = { buyerCompanyId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: offerInclude,
      }),
    ]);
    return paginatedResponse(rows.map(toMyOfferItem), total, { limit, offset });
  }

  // ── Продавец ──────────────────────────────────────────────────────────────

  // Список предложений по объявлению продавца. Имена/контакты покупателей скрыты
  // до акцепта (см. toListingOfferItem). Отозванные не показываем.
  async listListingOffers(user: RequestUser, listingId: string): Promise<ListingOfferItem[]> {
    this.assertCanUse(user);
    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      select: { sellerCompanyId: true },
    });
    if (!listing) {
      throw new NotFoundException("Объявление не найдено.");
    }
    if (!isListingOwner(user, listing.sellerCompanyId) && !isPlatformAdmin(user)) {
      throw new ForbiddenException("Это не ваше объявление.");
    }
    const offers = await this.prisma.offer.findMany({
      where: {
        listingId,
        status: { in: ["active", "accepted", "declined"] },
        positions: { some: { pricePerTonRub: { gt: 0 } } },
      },
      orderBy: { createdAt: "desc" },
      include: offerInclude,
    });
    return offers.map(toListingOfferItem);
  }

  async acceptOffer(user: RequestUser, offerId: string): Promise<ListingOfferItem> {
    this.assertCanUse(user);
    const offer = await this.loadSellerOfferOr404(user, offerId);
    if (offer.status !== "active") {
      throw new BadRequestException("Принять можно только активное предложение.");
    }
    if (offer.listing.status !== "active") {
      throw new BadRequestException("Объявление неактивно.");
    }
    const pending = await this.prisma.offer.findFirst({
      where: { listingId: offer.listingId, status: "accepted" },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException("По объявлению уже есть принятое предложение, ожидающее решения.");
    }

    const now = new Date();
    const updated = await acceptOfferWithRaceGuard(this.prisma, offer, now);
    await notifyMarketplaceOffer(this.notifications, {
      userId: offer.createdById,
      eventType: "marketplace.offer.accepted",
      title: "Предложение принято",
      body: "Продавец принял ваше предложение. Контакты раскрыты — свяжитесь для сделки.",
      link: "/marketplace/offers",
      sourceId: offerId,
    });
    return toListingOfferItem(updated);
  }

  async recordDeal(user: RequestUser, offerId: string, dto: DealDecisionDto): Promise<ListingOfferItem> {
    this.assertCanUse(user);
    const offer = await this.loadSellerOfferOr404(user, offerId);
    if (offer.status !== "accepted" || offer.dealResult !== null) {
      throw new BadRequestException("Решение фиксируется только по принятому предложению.");
    }
    const now = new Date();

    if (dto.result === "not_agreed") {
      const updated = await this.prisma.offer.update({
        where: { id: offerId },
        data: { status: "declined", dealResult: "not_agreed", resolvedAt: now },
        include: offerInclude,
      });
      await notifyMarketplaceOffer(this.notifications, {
        userId: offer.createdById,
        eventType: "marketplace.deal.failed",
        title: "Сделка не состоялась",
        body: "Продавец отметил, что договориться не удалось. Объявление снова активно.",
        link: "/marketplace/offers",
        sourceId: offerId,
      });
      return toListingOfferItem(updated);
    }

    // «Договорились»: объявление продано (архив), остальные активные — отклоняем.
    const competitors = await this.prisma.offer.findMany({
      where: { listingId: offer.listingId, status: "active", id: { not: offerId } },
      select: { id: true, createdById: true },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.offer.update({
        where: { id: offerId },
        data: { dealResult: "agreed", resolvedAt: now },
        include: offerInclude,
      });
      await tx.marketplaceListing.update({
        where: { id: offer.listingId },
        data: { status: "archived", archivedAt: now, archiveReason: "sold" },
      });
      await tx.offer.updateMany({
        where: { listingId: offer.listingId, status: "active" },
        data: { status: "declined", resolvedAt: now },
      });
      return result;
    });

    await notifyMarketplaceOffer(this.notifications, {
      userId: offer.createdById,
      eventType: "marketplace.deal.agreed",
      title: "Сделка состоялась",
      body: "Продавец подтвердил сделку. Скоро можно будет оставить отзыв.",
      link: "/marketplace/offers",
      sourceId: offerId,
    });
    await Promise.all(
      competitors.map((competitor) =>
        notifyMarketplaceOffer(this.notifications, {
          userId: competitor.createdById,
          eventType: "marketplace.offer.declined",
          title: "Выбрали другого покупателя",
          body: "По объявлению, на которое вы делали предложение, продавец выбрал другого покупателя.",
          link: "/marketplace/offers",
          sourceId: competitor.id,
        }),
      ),
    );
    return toListingOfferItem(updated);
  }

  // Cron: принятые предложения без решения за 24ч — архивируем объявление
  // (not_settled), сами предложения и конкурентов закрываем. Возвращает число.
  async autoResolveExpiredAcceptances(now = new Date()): Promise<number> {
    return autoResolveExpiredOfferAcceptances(this.prisma, this.notifications, now);
  }

  // ── Внутреннее ──────────────────────────────────────────────────────────

  private async loadSellerOfferOr404(user: RequestUser, offerId: string): Promise<OfferWithRelations> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!offer) {
      throw new NotFoundException("Предложение не найдено.");
    }
    if (!isListingOwner(user, offer.listing.sellerCompanyId) && !isPlatformAdmin(user)) {
      throw new ForbiddenException("Это предложение не по вашему объявлению.");
    }
    return offer;
  }
}

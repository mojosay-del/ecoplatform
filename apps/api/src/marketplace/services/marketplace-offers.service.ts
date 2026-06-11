import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationCategory } from "@prisma/client";
import {
  type CreateOfferDto,
  type DealDecisionDto,
  type ListingOfferItem,
  type MyOfferItem,
  type PaginatedResponse,
  canOpenFunctionalSections,
} from "@ecoplatform/shared";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { swallowAndLog } from "../../common/silent-catch";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { type OfferWithRelations, offerInclude, toListingOfferItem, toMyOfferItem } from "./marketplace-offers.helpers";

const DECISION_WINDOW_MS = 24 * 60 * 60 * 1000;
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
  ) {}

  // ── Гейты ─────────────────────────────────────────────────────────────────

  private assertCanUse(user: RequestUser) {
    if (user.platformRoles.length > 0) return;
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к площадке ограничен. Активируйте подписку в кабинете.");
    }
  }

  // Предложения делают покупатели — трейдеры и переработчики (по докам).
  private assertBuyer(user: RequestUser): string {
    this.assertCanUse(user);
    if (!user.companyId || (user.company?.type !== "trader" && user.company?.type !== "processor")) {
      throw new ForbiddenException("Делать предложения могут покупатели — трейдеры и переработчики.");
    }
    return user.companyId;
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

    const existing = await this.prisma.offer.findFirst({
      where: {
        listingId,
        buyerCompanyId,
        status: { in: ["active", "accepted"] },
        positions: { some: { pricePerTonRub: { gt: 0 } } },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("У вас уже есть активное предложение по этому объявлению — измените его.");
    }

    this.assertOfferPositions(
      dto,
      listing.positions.map((position) => position.id),
    );

    const offer = await this.prisma.offer.create({
      data: {
        listingId,
        buyerCompanyId,
        createdById: user.id,
        status: "active",
        priceCondition: dto.priceCondition,
        city: dto.city?.trim() || null,
        contactPhone: dto.contactPhone.trim(),
        positions: { create: offerPositionCreateData(dto) },
      },
      include: offerInclude,
    });

    await this.notify(
      listing.createdById,
      "marketplace.offer.created",
      "Новое предложение",
      "По вашему объявлению поступило новое ценовое предложение.",
      `/marketplace/${listingId}`,
      offer.id,
    );
    return toMyOfferItem(offer);
  }

  async updateOffer(user: RequestUser, offerId: string, dto: CreateOfferDto): Promise<MyOfferItem> {
    const buyerCompanyId = this.assertBuyer(user);
    const offer = await this.findOwnOfferOr404(buyerCompanyId, offerId);
    if (offer.status !== "active") {
      throw new BadRequestException("Изменить можно только активное предложение (до его принятия).");
    }
    this.assertOfferPositions(
      dto,
      offer.listing.positions.map((position) => position.id),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.offerPosition.deleteMany({ where: { offerId } });
      await tx.offerPosition.createMany({
        data: offerPositionCreateData(dto).map((position) => ({ ...position, offerId })),
      });
      return tx.offer.update({
        where: { id: offerId },
        data: {
          priceCondition: dto.priceCondition,
          city: dto.city?.trim() || null,
          contactPhone: dto.contactPhone.trim(),
        },
        include: offerInclude,
      });
    });

    await this.notify(
      offer.listing.createdById,
      "marketplace.offer.updated",
      "Предложение изменено",
      "Покупатель изменил предложение по вашему объявлению.",
      `/marketplace/${offer.listingId}`,
      offerId,
    );
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
    await this.notify(
      offer.listing.createdById,
      "marketplace.offer.withdrawn",
      "Предложение отозвано",
      "Покупатель отозвал предложение по вашему объявлению.",
      `/marketplace/${offer.listingId}`,
      offerId,
    );
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
    const isOwner = listing.sellerCompanyId === user.companyId;
    if (!isOwner && !user.platformRoles.includes("admin")) {
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
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: "accepted", acceptedAt: now, decisionDeadline: new Date(now.getTime() + DECISION_WINDOW_MS) },
      include: offerInclude,
    });
    await this.notify(
      offer.createdById,
      "marketplace.offer.accepted",
      "Предложение принято",
      "Продавец принял ваше предложение. Контакты раскрыты — свяжитесь для сделки.",
      "/marketplace/offers",
      offerId,
    );
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
      await this.notify(
        offer.createdById,
        "marketplace.deal.failed",
        "Сделка не состоялась",
        "Продавец отметил, что договориться не удалось. Объявление снова активно.",
        "/marketplace/offers",
        offerId,
      );
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

    await this.notify(
      offer.createdById,
      "marketplace.deal.agreed",
      "Сделка состоялась",
      "Продавец подтвердил сделку. Скоро можно будет оставить отзыв.",
      "/marketplace/offers",
      offerId,
    );
    await Promise.all(
      competitors.map((competitor) =>
        this.notify(
          competitor.createdById,
          "marketplace.offer.declined",
          "Выбрали другого покупателя",
          "По объявлению, на которое вы делали предложение, продавец выбрал другого покупателя.",
          "/marketplace/offers",
          competitor.id,
        ),
      ),
    );
    return toListingOfferItem(updated);
  }

  // Cron: принятые предложения без решения за 24ч — архивируем объявление
  // (not_settled), сами предложения и конкурентов закрываем. Возвращает число.
  async autoResolveExpiredAcceptances(now = new Date()): Promise<number> {
    const expired = await this.prisma.offer.findMany({
      where: { status: "accepted", dealResult: null, decisionDeadline: { lt: now } },
      select: { id: true, listingId: true, createdById: true },
    });
    if (expired.length === 0) return 0;

    for (const offer of expired) {
      await this.prisma.$transaction([
        this.prisma.offer.update({ where: { id: offer.id }, data: { status: "declined", resolvedAt: now } }),
        this.prisma.marketplaceListing.update({
          where: { id: offer.listingId },
          data: { status: "archived", archivedAt: now, archiveReason: "not_settled" },
        }),
        this.prisma.offer.updateMany({
          where: { listingId: offer.listingId, status: "active" },
          data: { status: "declined", resolvedAt: now },
        }),
      ]);
      await this.notify(
        offer.createdById,
        "marketplace.deal.timeout",
        "Время на решение истекло",
        "Продавец не подтвердил сделку за 24 часа. Объявление перемещено в архив.",
        "/marketplace/offers",
        offer.id,
      );
    }
    return expired.length;
  }

  // ── Внутреннее ──────────────────────────────────────────────────────────

  private async loadSellerOfferOr404(user: RequestUser, offerId: string): Promise<OfferWithRelations> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: offerInclude });
    if (!offer) {
      throw new NotFoundException("Предложение не найдено.");
    }
    if (offer.listing.sellerCompanyId !== user.companyId && !user.platformRoles.includes("admin")) {
      throw new ForbiddenException("Это предложение не по вашему объявлению.");
    }
    return offer;
  }

  private assertOfferPositions(dto: CreateOfferDto, listingPositionIds: string[]) {
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

  private async notify(userId: string, eventType: string, title: string, body: string, link: string, sourceId: string) {
    await this.notifications
      .createInApp({ userId, eventType, category: NotificationCategory.marketplace, title, body, link, sourceId })
      .catch(swallowAndLog(eventType, { userId, sourceId }));
  }
}

function offerPositionCreateData(dto: CreateOfferDto) {
  return dto.positions.map((position) => ({
    listingPositionId: position.listingPositionId,
    pricePerTonRub: position.pricePerTonRub ?? null,
  }));
}

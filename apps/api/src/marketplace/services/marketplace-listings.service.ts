import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateListingDto,
  materialFromNomenclatureCode,
  type MarketplaceListingDetail,
  type MarketplaceListingListItem,
  type MarketplaceNomenclatureOption,
  type MyMarketplaceListingItem,
  type PaginatedResponse,
  type UpdateListingDto,
} from "@ecoplatform/shared";
import {
  assertCompanyTypeIn,
  assertFunctionalAccess,
  canSeeListingContacts,
  isListingOwner,
} from "../../common/access-policy";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import { AddressGeocoderService } from "../../geo/address-geocoder.service";
import { PrismaService } from "../../prisma/prisma.service";
import { listingInclude, mapToDetailWithSellerStats, mapToListItem, mapToMyItem } from "./marketplace-listings.helpers";
import {
  type FeedParams,
  type ListParams,
  archiveExpiredListings,
  listingFeedWhere,
} from "./marketplace-listings-logic.helpers";
import {
  type MarketplaceListingWorkflowDeps,
  archiveListing,
  createListingDraft,
  publishListing,
  republishListing,
  updateListingDraft,
} from "./marketplace-listings-workflow.helpers";

// Сервис объявлений торговой площадки: жизненный цикл (черновик → публикация →
// архив/переподача), позиции, медиа (через FileReference), снимок адреса. Точные
// контакты/адрес отдаются только владельцу и админу (покупатель — после акцепта,
// фаза 3). Координаты круга 4 км — геокодинг Яндекса при сохранении адреса (фаза 2).
@Injectable()
export class MarketplaceListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly geocoder: AddressGeocoderService,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  private workflowDeps(): MarketplaceListingWorkflowDeps {
    return {
      prisma: this.prisma,
      files: this.files,
      geocoder: this.geocoder,
      moduleAccess: this.moduleAccess,
    };
  }

  // ── Гейты доступа ─────────────────────────────────────────────────────────

  // Площадка — функциональный раздел: нужен demo или активная подписка
  // (как в content-домене). Платформенный персонал проходит всегда.
  private assertCanUse(user: RequestUser) {
    assertFunctionalAccess(user, "Доступ к площадке ограничен. Активируйте подписку в кабинете.");
  }

  // Действия продавца (создать/опубликовать/архив/переподать) доступны только
  // заготовителям с активным доступом. Возвращает companyId продавца.
  private assertSeller(user: RequestUser): string {
    this.assertCanUse(user);
    return assertCompanyTypeIn(user, ["collector"], "Публиковать объявления могут только компании-заготовители.");
  }

  // ── Публичная лента + детальная карточка ─────────────────────────────────

  async listPublic(user: RequestUser, params: FeedParams): Promise<PaginatedResponse<MarketplaceListingListItem>> {
    this.assertCanUse(user);
    const { limit, offset } = resolvePagination(params, { defaultLimit: 100, maxLimit: 200 });
    const where = listingFeedWhere(params);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        take: limit,
        skip: offset,
        include: listingInclude,
      }),
    ]);

    return paginatedResponse(rows.map(mapToListItem), total, { limit, offset });
  }

  // Список регионов активных объявлений (значения для фильтра ленты).
  async listRegions(user: RequestUser): Promise<string[]> {
    this.assertCanUse(user);
    const rows = await this.prisma.address.groupBy({
      by: ["region"],
      where: {
        region: { not: null },
        marketplaceListing: { is: { status: "active" } },
      },
      orderBy: { region: "asc" },
    });
    return rows.map((row) => row.region).filter((region): region is string => Boolean(region));
  }

  async getDetail(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    this.assertCanUse(user);
    const listing = await this.prisma.marketplaceListing.findUnique({ where: { id }, include: listingInclude });
    if (!listing) {
      throw new NotFoundException("Объявление не найдено.");
    }

    const isOwner = isListingOwner(user, listing.sellerCompanyId);
    const canSeeContacts = canSeeListingContacts(user, listing.sellerCompanyId);
    // Чужим показываем только активную карточку; черновики/архив — лишь владельцу/админу.
    if (!canSeeContacts && listing.status !== "active") {
      throw new NotFoundException("Объявление не найдено.");
    }

    return mapToDetailWithSellerStats(this.prisma, listing, { canSeeContacts, isOwner });
  }

  // Справочник активной номенклатуры для селектов в форме объявления.
  async listNomenclature(user: RequestUser): Promise<MarketplaceNomenclatureOption[]> {
    this.assertCanUse(user);
    const rows = await this.prisma.nomenclature.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => {
      const material = materialFromNomenclatureCode(row.code);
      return {
        id: row.id,
        name: row.name,
        category: material.label,
        categorySlug: material.slug,
      };
    });
  }

  // ── Кабинет заготовителя ──────────────────────────────────────────────────

  async listMine(user: RequestUser, params: ListParams): Promise<PaginatedResponse<MyMarketplaceListingItem>> {
    const companyId = this.assertSeller(user);
    const { limit, offset } = resolvePagination(params, { defaultLimit: 20, maxLimit: 100 });
    const where = { sellerCompanyId: companyId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.marketplaceListing.count({ where }),
      this.prisma.marketplaceListing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: listingInclude,
      }),
    ]);

    return paginatedResponse(rows.map(mapToMyItem), total, { limit, offset });
  }

  // ── Жизненный цикл ────────────────────────────────────────────────────────

  async createDraft(user: RequestUser, dto: CreateListingDto): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const listing = await createListingDraft(this.workflowDeps(), { userId: user.id, companyId, dto });
    return mapToDetailWithSellerStats(this.prisma, listing, { canSeeContacts: true, isOwner: true });
  }

  async update(user: RequestUser, id: string, dto: UpdateListingDto): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const updated = await updateListingDraft(this.workflowDeps(), { companyId, id, dto });
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async publish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const updated = await publishListing(this.workflowDeps(), { userId: user.id, companyId, id });
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async archive(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const updated = await archiveListing(this.prisma, { companyId, id });
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async republish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const created = await republishListing(this.workflowDeps(), { userId: user.id, companyId, id });
    return mapToDetailWithSellerStats(this.prisma, created, { canSeeContacts: true, isOwner: true });
  }

  // Cron: переводит истёкшие активные объявления в архив и закрывает их активные
  // предложения. Объявления с принятым предложением в 24ч-окне НЕ трогаем — их
  // разрешает отдельный cron предложений. Возвращает число обработанных.
  async archiveExpired(now = new Date()): Promise<number> {
    return archiveExpiredListings(this.prisma, now);
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type CreateListingDto,
  LISTING_MAX_ACTIVE,
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
import {
  type ListingWithRelations,
  buildAddressCreateData,
  listingInclude,
  mapToDetailWithSellerStats,
  mapToListItem,
  mapToMyItem,
} from "./marketplace-listings.helpers";
import {
  type FeedParams,
  LISTING_FILE_ENTITY,
  LISTING_LIFETIME_MS,
  type ListParams,
  addressCreateDataFromSource,
  archiveExpiredListings,
  assertListingMediaValid,
  assertListingNomenclatureValid,
  assertListingPublishable,
  listingFeedWhere,
  listingMediaCreateData,
  listingOptionalText,
  listingPatchOptionalText,
  listingPositionCreateData,
  resolveListingAddressGeo,
  resolveStoredOrFreshListingAddressGeo,
} from "./marketplace-listings-logic.helpers";

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

  private async findOwnedOr404(companyId: string, id: string): Promise<ListingWithRelations> {
    const listing = await this.prisma.marketplaceListing.findFirst({
      where: { id, sellerCompanyId: companyId },
      include: listingInclude,
    });
    if (!listing) {
      throw new NotFoundException("Объявление не найдено.");
    }
    return listing;
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
    // Санкция модерации module_restriction("marketplace") блокирует размещение.
    await this.moduleAccess.assertModuleAccess(user.id, "marketplace");
    await assertListingNomenclatureValid(
      this.prisma,
      dto.positions.map((position) => position.nomenclatureId),
    );
    await assertListingMediaValid(this.prisma, dto.media);

    const addressData = buildAddressCreateData(dto.address);
    const geo = await resolveListingAddressGeo(this.geocoder, addressData);

    const listing = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.create({ data: { ...addressData, ...geo.coords } });
      return tx.marketplaceListing.create({
        data: {
          sellerCompanyId: companyId,
          createdById: user.id,
          status: "draft",
          addressId: address.id,
          circleLat: geo.circleLat,
          circleLon: geo.circleLon,
          contactPhone: dto.contactPhone.trim(),
          description: listingOptionalText(dto.description),
          paymentTerms: listingOptionalText(dto.paymentTerms),
          typicalLoadKg: dto.typicalLoadKg ?? null,
          readyNow: dto.readyNow,
          readinessDate: dto.readinessDate ? new Date(dto.readinessDate) : null,
          positions: { create: listingPositionCreateData(dto.positions) },
          media: { create: listingMediaCreateData(dto.media) },
        },
        include: listingInclude,
      });
    });

    await this.files.replaceFileReferences(
      LISTING_FILE_ENTITY,
      listing.id,
      dto.media.map((item) => item.fileId),
    );
    return mapToDetailWithSellerStats(this.prisma, listing, { canSeeContacts: true, isOwner: true });
  }

  async update(user: RequestUser, id: string, dto: UpdateListingDto): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const existing = await this.findOwnedOr404(companyId, id);
    if (existing.status === "archived") {
      throw new BadRequestException("Архивное объявление нельзя редактировать — используйте переподачу.");
    }
    if (dto.positions) {
      await assertListingNomenclatureValid(
        this.prisma,
        dto.positions.map((position) => position.nomenclatureId),
      );
    }
    if (dto.media) {
      await assertListingMediaValid(this.prisma, dto.media);
    }

    const addressData = dto.address ? buildAddressCreateData(dto.address) : null;
    const geo = addressData ? await resolveListingAddressGeo(this.geocoder, addressData) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (addressData && geo) {
        await tx.address.update({ where: { id: existing.addressId }, data: { ...addressData, ...geo.coords } });
      }
      if (dto.positions) {
        await tx.listingPosition.deleteMany({ where: { listingId: id } });
        await tx.listingPosition.createMany({
          data: listingPositionCreateData(dto.positions).map((position) => ({ ...position, listingId: id })),
        });
      }
      if (dto.media) {
        await tx.listingMedia.deleteMany({ where: { listingId: id } });
        await tx.listingMedia.createMany({
          data: listingMediaCreateData(dto.media).map((item) => ({ ...item, listingId: id })),
        });
      }
      return tx.marketplaceListing.update({
        where: { id },
        data: {
          contactPhone: dto.contactPhone?.trim(),
          description: listingPatchOptionalText(dto.description),
          paymentTerms: listingPatchOptionalText(dto.paymentTerms),
          typicalLoadKg: dto.typicalLoadKg === undefined ? undefined : (dto.typicalLoadKg ?? null),
          readyNow: dto.readyNow,
          readinessDate:
            dto.readinessDate === undefined ? undefined : dto.readinessDate ? new Date(dto.readinessDate) : null,
          // Смена адреса до первого предложения → новый отображаемый центр (geo-logic.md 7.5).
          ...(geo ? { circleLat: geo.circleLat, circleLon: geo.circleLon } : {}),
        },
        include: listingInclude,
      });
    });

    if (dto.media) {
      await this.files.replaceFileReferences(
        LISTING_FILE_ENTITY,
        id,
        dto.media.map((item) => item.fileId),
      );
    }
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async publish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    await this.moduleAccess.assertModuleAccess(user.id, "marketplace");
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "active") {
      return mapToDetailWithSellerStats(this.prisma, listing, { canSeeContacts: true, isOwner: true });
    }
    if (listing.status === "archived") {
      throw new BadRequestException("Архивное объявление нельзя опубликовать — используйте переподачу.");
    }

    assertListingPublishable(listing);

    const activeCount = await this.prisma.marketplaceListing.count({
      where: { sellerCompanyId: companyId, status: "active" },
    });
    if (activeCount >= LISTING_MAX_ACTIVE) {
      throw new BadRequestException(`Можно держать не больше ${LISTING_MAX_ACTIVE} активных объявлений.`);
    }

    const now = new Date();
    const updated = await this.prisma.marketplaceListing.update({
      where: { id },
      data: {
        status: "active",
        publishedAt: now,
        expiresAt: new Date(now.getTime() + LISTING_LIFETIME_MS),
        archivedAt: null,
        archiveReason: null,
      },
      include: listingInclude,
    });
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async archive(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "archived") {
      return mapToDetailWithSellerStats(this.prisma, listing, { canSeeContacts: true, isOwner: true });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.marketplaceListing.update({
        where: { id },
        data: { status: "archived", archivedAt: now, archiveReason: "withdrawn" },
        include: listingInclude,
      });
      // Снятие объявления закрывает все его открытые/принятые предложения.
      await tx.offer.updateMany({
        where: { listingId: id, status: { in: ["active", "accepted"] }, dealResult: null },
        data: { status: "declined", resolvedAt: now },
      });
      return result;
    });
    return mapToDetailWithSellerStats(this.prisma, updated, { canSeeContacts: true, isOwner: true });
  }

  async republish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    await this.moduleAccess.assertModuleAccess(user.id, "marketplace");
    const source = await this.findOwnedOr404(companyId, id);
    if (source.status !== "archived") {
      throw new BadRequestException("Переподать можно только архивное объявление.");
    }
    // Снятое модератором объявление переподать нельзя (обход модерации).
    if (source.archiveReason === "removed_by_moderator") {
      throw new ForbiddenException("Объявление снято модератором — переподача недоступна.");
    }

    const addressData = addressCreateDataFromSource(source.address);
    // Переподача = новое объявление → новый отображаемый центр (защита от
    // триангуляции по нескольким объявлениям одной партии, geo-logic.md 7.4).
    // Если старое объявление создавалось без координат, пробуем догеокодить
    // сохранённую строку адреса перед созданием новой копии.
    const geo = await resolveStoredOrFreshListingAddressGeo(this.geocoder, addressData, source.address);

    const created = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.create({
        data: {
          ...addressData,
          ...geo.coords,
        },
      });
      return tx.marketplaceListing.create({
        data: {
          sellerCompanyId: companyId,
          createdById: user.id,
          status: "draft",
          addressId: address.id,
          circleLat: geo.circleLat,
          circleLon: geo.circleLon,
          contactPhone: source.contactPhone,
          description: source.description,
          paymentTerms: source.paymentTerms,
          typicalLoadKg: source.typicalLoadKg,
          readyNow: source.readyNow,
          readinessDate: source.readinessDate,
          positions: {
            create: source.positions.map((position) => ({
              nomenclatureId: position.nomenclatureId,
              position: position.position,
              weightKg: position.weightKg,
              form: position.form,
              packaging: position.packaging,
              moistureCondition: position.moistureCondition,
              contaminationCondition: position.contaminationCondition,
            })),
          },
          media: {
            create: source.media.map((item) => ({ fileId: item.fileId, kind: item.kind, position: item.position })),
          },
        },
        include: listingInclude,
      });
    });

    await this.files.replaceFileReferences(
      LISTING_FILE_ENTITY,
      created.id,
      created.media.map((item) => item.fileId),
    );
    return mapToDetailWithSellerStats(this.prisma, created, { canSeeContacts: true, isOwner: true });
  }

  // Cron: переводит истёкшие активные объявления в архив и закрывает их активные
  // предложения. Объявления с принятым предложением в 24ч-окне НЕ трогаем — их
  // разрешает отдельный cron предложений. Возвращает число обработанных.
  async archiveExpired(now = new Date()): Promise<number> {
    return archiveExpiredListings(this.prisma, now);
  }
}

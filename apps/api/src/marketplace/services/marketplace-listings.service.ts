import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateListingDto,
  LISTING_LIFETIME_DAYS,
  LISTING_MAX_ACTIVE,
  LISTING_MAX_PHOTOS,
  LISTING_MAX_VIDEOS,
  LISTING_MIN_PHOTOS,
  LISTING_MIN_WEIGHT_KG,
  type ListingMediaInput,
  type ListingPositionInput,
  type MarketplaceListingDetail,
  type MarketplaceListingListItem,
  type MarketplaceNomenclatureOption,
  type MyMarketplaceListingItem,
  type PaginatedResponse,
  type UpdateListingDto,
  canOpenFunctionalSections,
} from "@ecoplatform/shared";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import { AddressGeocoderService } from "../../geo/address-geocoder.service";
import { PrismaService } from "../../prisma/prisma.service";
import { generateCircleCenter } from "./marketplace-geo.helpers";
import {
  type ListingWithRelations,
  buildAddressCreateData,
  listingInclude,
  mapToDetail,
  mapToListItem,
  mapToMyItem,
} from "./marketplace-listings.helpers";

const LISTING_FILE_ENTITY = "marketplace_listing";
const DAY_MS = 24 * 60 * 60 * 1000;
type ListParams = { limit?: number; offset?: number };
type FeedParams = ListParams & { region?: string[]; nomenclatureId?: string[] };

// Координаты адреса + отображаемый центр круга для записи в БД (после геокодинга).
type AddressGeo = {
  coords: { latitude?: Prisma.Decimal; longitude?: Prisma.Decimal; region?: string | null };
  circleLat: Prisma.Decimal | null;
  circleLon: Prisma.Decimal | null;
};

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

  // Геокодит formatted-адрес (вне транзакции — сетевой вызов) и готовит координаты
  // адреса + отображаемый центр круга. Без ключа/при ошибке геокодера — пусто
  // (объявление сохраняется без круга, как требует geo-logic.md).
  private async resolveAddressGeo(addressData: ReturnType<typeof buildAddressCreateData>): Promise<AddressGeo> {
    const result = await this.geocoder.geocode(addressData.formatted);
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

  // ── Гейты доступа ─────────────────────────────────────────────────────────

  // Площадка — функциональный раздел: нужен demo или активная подписка
  // (как в content-домене). Платформенный персонал проходит всегда.
  private assertCanUse(user: RequestUser) {
    if (user.platformRoles.length > 0) return;
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к площадке ограничен. Активируйте подписку в кабинете.");
    }
  }

  // Действия продавца (создать/опубликовать/архив/переподать) доступны только
  // заготовителям с активным доступом. Возвращает companyId продавца.
  private assertSeller(user: RequestUser): string {
    this.assertCanUse(user);
    if (!user.companyId || user.company?.type !== "collector") {
      throw new ForbiddenException("Публиковать объявления могут только компании-заготовители.");
    }
    return user.companyId;
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
    const where: Prisma.MarketplaceListingWhereInput = {
      status: "active",
      ...(params.region && params.region.length ? { address: { region: { in: params.region } } } : {}),
      ...(params.nomenclatureId && params.nomenclatureId.length
        ? { positions: { some: { nomenclatureId: { in: params.nomenclatureId } } } }
        : {}),
    };

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
    const rows = await this.prisma.marketplaceListing.findMany({
      where: { status: "active" },
      select: { address: { select: { region: true } } },
    });
    return Array.from(
      new Set(rows.map((row) => row.address.region).filter((region): region is string => Boolean(region))),
    ).sort((a, b) => a.localeCompare(b, "ru"));
  }

  async getDetail(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    this.assertCanUse(user);
    const listing = await this.prisma.marketplaceListing.findUnique({ where: { id }, include: listingInclude });
    if (!listing) {
      throw new NotFoundException("Объявление не найдено.");
    }

    const isOwner = Boolean(user.companyId && listing.sellerCompanyId === user.companyId);
    const isAdmin = user.platformRoles.includes("admin");
    // Чужим показываем только активную карточку; черновики/архив — лишь владельцу/админу.
    if (!isOwner && !isAdmin && listing.status !== "active") {
      throw new NotFoundException("Объявление не найдено.");
    }

    return this.mapDetail(listing, { canSeeContacts: isOwner || isAdmin, isOwner });
  }

  // Справочник активной номенклатуры для селектов в форме объявления.
  async listNomenclature(user: RequestUser): Promise<MarketplaceNomenclatureOption[]> {
    this.assertCanUse(user);
    const rows = await this.prisma.nomenclature.findMany({
      where: { isActive: true },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
      include: { category: { select: { name: true } } },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, category: row.category.name }));
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
    await this.assertNomenclatureValid(dto.positions.map((position) => position.nomenclatureId));
    await this.assertMediaValid(dto.media);

    const addressData = buildAddressCreateData(dto.address);
    const geo = await this.resolveAddressGeo(addressData);

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
          description: optionalText(dto.description),
          packaging: listingPackagingForCreate(dto.packaging, dto.positions),
          paymentTerms: optionalText(dto.paymentTerms),
          typicalLoadKg: dto.typicalLoadKg ?? null,
          readyNow: dto.readyNow,
          readinessDate: dto.readinessDate ? new Date(dto.readinessDate) : null,
          positions: { create: positionCreateData(dto.positions) },
          media: { create: mediaCreateData(dto.media) },
        },
        include: listingInclude,
      });
    });

    await this.files.replaceFileReferences(
      LISTING_FILE_ENTITY,
      listing.id,
      dto.media.map((item) => item.fileId),
    );
    return this.mapDetail(listing, { canSeeContacts: true, isOwner: true });
  }

  async update(user: RequestUser, id: string, dto: UpdateListingDto): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const existing = await this.findOwnedOr404(companyId, id);
    if (existing.status === "archived") {
      throw new BadRequestException("Архивное объявление нельзя редактировать — используйте переподачу.");
    }
    if (dto.positions) {
      await this.assertNomenclatureValid(dto.positions.map((position) => position.nomenclatureId));
    }
    if (dto.media) {
      await this.assertMediaValid(dto.media);
    }

    const addressData = dto.address ? buildAddressCreateData(dto.address) : null;
    const geo = addressData ? await this.resolveAddressGeo(addressData) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (addressData && geo) {
        await tx.address.update({ where: { id: existing.addressId }, data: { ...addressData, ...geo.coords } });
      }
      if (dto.positions) {
        await tx.listingPosition.deleteMany({ where: { listingId: id } });
        await tx.listingPosition.createMany({
          data: positionCreateData(dto.positions).map((position) => ({ ...position, listingId: id })),
        });
      }
      if (dto.media) {
        await tx.listingMedia.deleteMany({ where: { listingId: id } });
        await tx.listingMedia.createMany({
          data: mediaCreateData(dto.media).map((item) => ({ ...item, listingId: id })),
        });
      }
      return tx.marketplaceListing.update({
        where: { id },
        data: {
          contactPhone: dto.contactPhone?.trim(),
          description: patchOptionalText(dto.description),
          packaging: listingPackagingForUpdate(dto.packaging, dto.positions),
          paymentTerms: patchOptionalText(dto.paymentTerms),
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
    return this.mapDetail(updated, { canSeeContacts: true, isOwner: true });
  }

  async publish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    await this.moduleAccess.assertModuleAccess(user.id, "marketplace");
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "active") {
      return this.mapDetail(listing, { canSeeContacts: true, isOwner: true });
    }
    if (listing.status === "archived") {
      throw new BadRequestException("Архивное объявление нельзя опубликовать — используйте переподачу.");
    }

    this.assertPublishable(listing);

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
        expiresAt: new Date(now.getTime() + LISTING_LIFETIME_DAYS * DAY_MS),
        archivedAt: null,
        archiveReason: null,
      },
      include: listingInclude,
    });
    return this.mapDetail(updated, { canSeeContacts: true, isOwner: true });
  }

  async archive(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "archived") {
      return this.mapDetail(listing, { canSeeContacts: true, isOwner: true });
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
    return this.mapDetail(updated, { canSeeContacts: true, isOwner: true });
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

    // Переподача = новое объявление → новый отображаемый центр (защита от
    // триангуляции по нескольким объявлениям одной партии, geo-logic.md 7.4).
    const circle =
      source.address.latitude !== null && source.address.longitude !== null
        ? generateCircleCenter(Number(source.address.latitude), Number(source.address.longitude))
        : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.create({
        data: {
          country: source.address.country,
          region: source.address.region,
          city: source.address.city,
          street: source.address.street,
          building: source.address.building,
          apartment: source.address.apartment,
          postcode: source.address.postcode,
          latitude: source.address.latitude,
          longitude: source.address.longitude,
          formatted: source.address.formatted,
          source: source.address.source,
        },
      });
      return tx.marketplaceListing.create({
        data: {
          sellerCompanyId: companyId,
          createdById: user.id,
          status: "draft",
          addressId: address.id,
          circleLat: circle ? new Prisma.Decimal(circle.lat) : null,
          circleLon: circle ? new Prisma.Decimal(circle.lon) : null,
          contactPhone: source.contactPhone,
          description: source.description,
          packaging: source.packaging,
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
              moisturePct: position.moisturePct,
              contaminationPct: position.contaminationPct,
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
    return this.mapDetail(created, { canSeeContacts: true, isOwner: true });
  }

  // Cron: переводит истёкшие активные объявления в архив и закрывает их активные
  // предложения. Объявления с принятым предложением в 24ч-окне НЕ трогаем — их
  // разрешает отдельный cron предложений. Возвращает число обработанных.
  async archiveExpired(now = new Date()): Promise<number> {
    const expiring = await this.prisma.marketplaceListing.findMany({
      where: {
        status: "active",
        expiresAt: { lt: now },
        offers: { none: { status: "accepted", dealResult: null } },
      },
      select: { id: true },
    });
    if (expiring.length === 0) return 0;

    const ids = expiring.map((listing) => listing.id);
    await this.prisma.$transaction([
      this.prisma.marketplaceListing.updateMany({
        where: { id: { in: ids } },
        data: { status: "archived", archivedAt: now, archiveReason: "expired" },
      }),
      this.prisma.offer.updateMany({
        where: { listingId: { in: ids }, status: "active" },
        data: { status: "declined", resolvedAt: now },
      }),
    ]);
    return ids.length;
  }

  // ── Валидация ─────────────────────────────────────────────────────────────

  private async mapDetail(
    listing: ListingWithRelations,
    options: { canSeeContacts: boolean; isOwner: boolean },
  ): Promise<MarketplaceListingDetail> {
    const sellerUser = await this.prisma.user.findUnique({
      where: { id: listing.createdById },
      select: { gender: true },
    });
    return mapToDetail(listing, { ...options, sellerGender: sellerUser?.gender ?? null });
  }

  private assertPublishable(listing: ListingWithRelations) {
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
      const maxDate = new Date(Date.now() + LISTING_LIFETIME_DAYS * DAY_MS);
      if (listing.readinessDate.getTime() > maxDate.getTime()) {
        throw new BadRequestException(`Дата готовности — не дальше ${LISTING_LIFETIME_DAYS} дней.`);
      }
    }
  }

  private async assertNomenclatureValid(ids: string[]) {
    const unique = Array.from(new Set(ids));
    const found = await this.prisma.nomenclature.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) {
      throw new BadRequestException("В позициях указана неизвестная номенклатура.");
    }
  }

  private async assertMediaValid(media: ListingMediaInput[]) {
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
    const found = await this.prisma.fileAsset.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException("Некоторые прикреплённые файлы не найдены.");
    }
  }
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Для PATCH: undefined — поле не трогаем, иначе нормализуем пустую строку в null.
function patchOptionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return optionalText(value);
}

function aggregatePositionPackaging(positions: ListingPositionInput[]): string | null {
  const items = positions
    .flatMap((position) => (position.packaging ?? "").split(","))
    .map((part) => part.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(items));
  return unique.length > 0 ? unique.join(", ") : null;
}

function listingPackagingForCreate(packaging: string | null | undefined, positions: ListingPositionInput[]) {
  return aggregatePositionPackaging(positions) ?? optionalText(packaging);
}

function listingPackagingForUpdate(
  packaging: string | null | undefined,
  positions: ListingPositionInput[] | undefined,
): string | null | undefined {
  if (positions) {
    return aggregatePositionPackaging(positions) ?? patchOptionalText(packaging) ?? null;
  }
  return patchOptionalText(packaging);
}

function positionCreateData(positions: ListingPositionInput[]) {
  return positions.map((position, index) => ({
    nomenclatureId: position.nomenclatureId,
    position: index,
    weightKg: new Prisma.Decimal(position.weightKg),
    form: position.form,
    packaging: optionalText(position.packaging),
    moistureCondition: position.moistureCondition ?? null,
    contaminationCondition: position.contaminationCondition ?? null,
    moisturePct: position.moisturePct == null ? null : new Prisma.Decimal(position.moisturePct),
    contaminationPct: position.contaminationPct == null ? null : new Prisma.Decimal(position.contaminationPct),
  }));
}

function mediaCreateData(media: ListingMediaInput[]) {
  return media.map((item, index) => ({ fileId: item.fileId, kind: item.kind, position: index }));
}

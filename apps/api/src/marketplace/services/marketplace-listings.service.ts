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
import { paginatedResponse, resolvePagination } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import { PrismaService } from "../../prisma/prisma.service";
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

// Сервис объявлений торговой площадки: жизненный цикл (черновик → публикация →
// архив/переподача), позиции, медиа (через FileReference), снимок адреса. Точные
// контакты/адрес отдаются только владельцу и админу (покупатель — после акцепта,
// фаза 3). Карта и координаты круга 4 км появятся на фазе 2 (геокодинг Яндекса).
@Injectable()
export class MarketplaceListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

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

  async listPublic(user: RequestUser, params: ListParams): Promise<PaginatedResponse<MarketplaceListingListItem>> {
    this.assertCanUse(user);
    const { limit, offset } = resolvePagination(params, { defaultLimit: 20, maxLimit: 100 });
    const where = { status: "active" as const };

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

    return mapToDetail(listing, { canSeeContacts: isOwner || isAdmin });
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
    await this.assertNomenclatureValid(dto.positions.map((position) => position.nomenclatureId));
    await this.assertMediaValid(dto.media);

    const listing = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.create({ data: buildAddressCreateData(dto.address) });
      return tx.marketplaceListing.create({
        data: {
          sellerCompanyId: companyId,
          createdById: user.id,
          status: "draft",
          addressId: address.id,
          contactPhone: dto.contactPhone.trim(),
          description: optionalText(dto.description),
          color: optionalText(dto.color),
          packaging: optionalText(dto.packaging),
          paymentTerms: optionalText(dto.paymentTerms),
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
    return mapToDetail(listing, { canSeeContacts: true });
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

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.address) {
        await tx.address.update({ where: { id: existing.addressId }, data: buildAddressCreateData(dto.address) });
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
          color: patchOptionalText(dto.color),
          packaging: patchOptionalText(dto.packaging),
          paymentTerms: patchOptionalText(dto.paymentTerms),
          readyNow: dto.readyNow,
          readinessDate:
            dto.readinessDate === undefined ? undefined : dto.readinessDate ? new Date(dto.readinessDate) : null,
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
    return mapToDetail(updated, { canSeeContacts: true });
  }

  async publish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "active") {
      return mapToDetail(listing, { canSeeContacts: true });
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
    return mapToDetail(updated, { canSeeContacts: true });
  }

  async archive(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const listing = await this.findOwnedOr404(companyId, id);
    if (listing.status === "archived") {
      return mapToDetail(listing, { canSeeContacts: true });
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
    return mapToDetail(updated, { canSeeContacts: true });
  }

  async republish(user: RequestUser, id: string): Promise<MarketplaceListingDetail> {
    const companyId = this.assertSeller(user);
    const source = await this.findOwnedOr404(companyId, id);
    if (source.status !== "archived") {
      throw new BadRequestException("Переподать можно только архивное объявление.");
    }

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
          contactPhone: source.contactPhone,
          description: source.description,
          color: source.color,
          packaging: source.packaging,
          paymentTerms: source.paymentTerms,
          readyNow: source.readyNow,
          readinessDate: source.readinessDate,
          positions: {
            create: source.positions.map((position) => ({
              nomenclatureId: position.nomenclatureId,
              position: position.position,
              weightKg: position.weightKg,
              form: position.form,
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
    return mapToDetail(created, { canSeeContacts: true });
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

function positionCreateData(positions: ListingPositionInput[]) {
  return positions.map((position, index) => ({
    nomenclatureId: position.nomenclatureId,
    position: index,
    weightKg: new Prisma.Decimal(position.weightKg),
    form: position.form,
    moisturePct: position.moisturePct == null ? null : new Prisma.Decimal(position.moisturePct),
    contaminationPct: position.contaminationPct == null ? null : new Prisma.Decimal(position.contaminationPct),
  }));
}

function mediaCreateData(media: ListingMediaInput[]) {
  return media.map((item, index) => ({ fileId: item.fileId, kind: item.kind, position: index }));
}

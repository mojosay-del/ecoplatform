import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { type CreateListingDto, LISTING_MAX_ACTIVE, type UpdateListingDto } from "@ecoplatform/shared";
import type { ModuleAccessService } from "../../common/module-access.service";
import type { FilesService } from "../../files/files.service";
import type { AddressGeocoderService } from "../../geo/address-geocoder.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { type ListingWithRelations, buildAddressCreateData, listingInclude } from "./marketplace-listings.helpers";
import {
  LISTING_FILE_ENTITY,
  LISTING_LIFETIME_MS,
  addressCreateDataFromSource,
  assertListingMediaValid,
  assertListingNomenclatureValid,
  assertListingPublishable,
  listingMediaCreateData,
  listingOptionalText,
  listingPatchOptionalText,
  listingPositionCreateData,
  resolveListingAddressGeo,
  resolveStoredOrFreshListingAddressGeo,
} from "./marketplace-listings-logic.helpers";

export type MarketplaceListingWorkflowDeps = {
  prisma: PrismaService;
  files: FilesService;
  geocoder: AddressGeocoderService;
  moduleAccess: ModuleAccessService;
};

export async function findOwnedListingOrThrow(
  prisma: PrismaService,
  companyId: string,
  id: string,
): Promise<ListingWithRelations> {
  const listing = await prisma.marketplaceListing.findFirst({
    where: { id, sellerCompanyId: companyId },
    include: listingInclude,
  });
  if (!listing) {
    throw new NotFoundException("Объявление не найдено.");
  }
  return listing;
}

export async function createListingDraft(
  deps: MarketplaceListingWorkflowDeps,
  input: { userId: string; companyId: string; dto: CreateListingDto },
): Promise<ListingWithRelations> {
  await deps.moduleAccess.assertModuleAccess(input.userId, "marketplace");
  await assertListingNomenclatureValid(
    deps.prisma,
    input.dto.positions.map((position) => position.nomenclatureId),
  );
  await assertListingMediaValid(deps.prisma, input.dto.media);

  const addressData = buildAddressCreateData(input.dto.address);
  const geo = await resolveListingAddressGeo(deps.geocoder, addressData);

  const listing = await deps.prisma.$transaction(async (tx) => {
    const address = await tx.address.create({ data: { ...addressData, ...geo.coords } });
    return tx.marketplaceListing.create({
      data: {
        sellerCompanyId: input.companyId,
        createdById: input.userId,
        status: "draft",
        addressId: address.id,
        circleLat: geo.circleLat,
        circleLon: geo.circleLon,
        contactPhone: input.dto.contactPhone.trim(),
        description: listingOptionalText(input.dto.description),
        paymentTerms: listingOptionalText(input.dto.paymentTerms),
        typicalLoadKg: input.dto.typicalLoadKg ?? null,
        readyNow: input.dto.readyNow,
        readinessDate: input.dto.readinessDate ? new Date(input.dto.readinessDate) : null,
        positions: { create: listingPositionCreateData(input.dto.positions) },
        media: { create: listingMediaCreateData(input.dto.media) },
      },
      include: listingInclude,
    });
  });

  await deps.files.replaceFileReferences(
    LISTING_FILE_ENTITY,
    listing.id,
    input.dto.media.map((item) => item.fileId),
  );
  return listing;
}

export async function updateListingDraft(
  deps: MarketplaceListingWorkflowDeps,
  input: { companyId: string; id: string; dto: UpdateListingDto },
): Promise<ListingWithRelations> {
  const existing = await findOwnedListingOrThrow(deps.prisma, input.companyId, input.id);
  if (existing.status === "archived") {
    throw new BadRequestException("Архивное объявление нельзя редактировать — используйте переподачу.");
  }
  if (input.dto.positions) {
    await assertListingNomenclatureValid(
      deps.prisma,
      input.dto.positions.map((position) => position.nomenclatureId),
    );
  }
  if (input.dto.media) {
    await assertListingMediaValid(deps.prisma, input.dto.media);
  }

  const addressData = input.dto.address ? buildAddressCreateData(input.dto.address) : null;
  const geo = addressData ? await resolveListingAddressGeo(deps.geocoder, addressData) : null;

  const updated = await deps.prisma.$transaction(async (tx) => {
    if (addressData && geo) {
      await tx.address.update({ where: { id: existing.addressId }, data: { ...addressData, ...geo.coords } });
    }
    if (input.dto.positions) {
      await tx.listingPosition.deleteMany({ where: { listingId: input.id } });
      await tx.listingPosition.createMany({
        data: listingPositionCreateData(input.dto.positions).map((position) => ({ ...position, listingId: input.id })),
      });
    }
    if (input.dto.media) {
      await tx.listingMedia.deleteMany({ where: { listingId: input.id } });
      await tx.listingMedia.createMany({
        data: listingMediaCreateData(input.dto.media).map((item) => ({ ...item, listingId: input.id })),
      });
    }
    return tx.marketplaceListing.update({
      where: { id: input.id },
      data: {
        contactPhone: input.dto.contactPhone?.trim(),
        description: listingPatchOptionalText(input.dto.description),
        paymentTerms: listingPatchOptionalText(input.dto.paymentTerms),
        typicalLoadKg: input.dto.typicalLoadKg === undefined ? undefined : (input.dto.typicalLoadKg ?? null),
        readyNow: input.dto.readyNow,
        readinessDate:
          input.dto.readinessDate === undefined
            ? undefined
            : input.dto.readinessDate
              ? new Date(input.dto.readinessDate)
              : null,
        ...(geo ? { circleLat: geo.circleLat, circleLon: geo.circleLon } : {}),
      },
      include: listingInclude,
    });
  });

  if (input.dto.media) {
    await deps.files.replaceFileReferences(
      LISTING_FILE_ENTITY,
      input.id,
      input.dto.media.map((item) => item.fileId),
    );
  }
  return updated;
}

export async function publishListing(
  deps: MarketplaceListingWorkflowDeps,
  input: { userId: string; companyId: string; id: string },
): Promise<ListingWithRelations> {
  await deps.moduleAccess.assertModuleAccess(input.userId, "marketplace");
  const listing = await findOwnedListingOrThrow(deps.prisma, input.companyId, input.id);
  if (listing.status === "active") {
    return listing;
  }
  if (listing.status === "archived") {
    throw new BadRequestException("Архивное объявление нельзя опубликовать — используйте переподачу.");
  }

  assertListingPublishable(listing);

  const activeCount = await deps.prisma.marketplaceListing.count({
    where: { sellerCompanyId: input.companyId, status: "active" },
  });
  if (activeCount >= LISTING_MAX_ACTIVE) {
    throw new BadRequestException(`Можно держать не больше ${LISTING_MAX_ACTIVE} активных объявлений.`);
  }

  const now = new Date();
  return deps.prisma.marketplaceListing.update({
    where: { id: input.id },
    data: {
      status: "active",
      publishedAt: now,
      expiresAt: new Date(now.getTime() + LISTING_LIFETIME_MS),
      archivedAt: null,
      archiveReason: null,
    },
    include: listingInclude,
  });
}

export async function archiveListing(
  prisma: PrismaService,
  input: { companyId: string; id: string },
): Promise<ListingWithRelations> {
  const listing = await findOwnedListingOrThrow(prisma, input.companyId, input.id);
  if (listing.status === "archived") {
    return listing;
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const result = await tx.marketplaceListing.update({
      where: { id: input.id },
      data: { status: "archived", archivedAt: now, archiveReason: "withdrawn" },
      include: listingInclude,
    });
    await tx.offer.updateMany({
      where: { listingId: input.id, status: { in: ["active", "accepted"] }, dealResult: null },
      data: { status: "declined", resolvedAt: now },
    });
    return result;
  });
}

export async function republishListing(
  deps: MarketplaceListingWorkflowDeps,
  input: { userId: string; companyId: string; id: string },
): Promise<ListingWithRelations> {
  await deps.moduleAccess.assertModuleAccess(input.userId, "marketplace");
  const source = await findOwnedListingOrThrow(deps.prisma, input.companyId, input.id);
  if (source.status !== "archived") {
    throw new BadRequestException("Переподать можно только архивное объявление.");
  }
  if (source.archiveReason === "removed_by_moderator") {
    throw new ForbiddenException("Объявление снято модератором — переподача недоступна.");
  }

  const addressData = addressCreateDataFromSource(source.address);
  const geo = await resolveStoredOrFreshListingAddressGeo(deps.geocoder, addressData, source.address);

  // Истёкшее по сроку объявление при переподаче удаляем, чтобы не копить «мусор»
  // в кабинете заготовителя. У истёкшего нет состоявшейся сделки → отзывы не
  // теряются; каскад снимает позиции, медиа и «мёртвые» ставки. Проданные и
  // снятые вручную объявления НЕ трогаем — это история сделок компании.
  const removeSource = source.archiveReason === "expired";

  const created = await deps.prisma.$transaction(async (tx) => {
    const address = await tx.address.create({ data: { ...addressData, ...geo.coords } });
    const draft = await tx.marketplaceListing.create({
      data: {
        sellerCompanyId: input.companyId,
        createdById: input.userId,
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
    if (removeSource) {
      await tx.marketplaceListing.delete({ where: { id: source.id } });
      await tx.address.delete({ where: { id: source.addressId } });
    }
    return draft;
  });

  await deps.files.replaceFileReferences(
    LISTING_FILE_ENTITY,
    created.id,
    created.media.map((item) => item.fileId),
  );
  // Файловые ссылки удалённого истёкшего объявления снимаем отдельно: медиа-строки
  // ушли каскадом, но учёт ссылок ведётся вне FK.
  if (removeSource) {
    await deps.files.replaceFileReferences(LISTING_FILE_ENTITY, source.id, []);
  }
  return created;
}

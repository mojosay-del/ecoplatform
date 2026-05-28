import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { filterPriceIndexPoints, slugify, summarizePriceIndex } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { PlatformSettingsService } from "../../admin/settings/platform-settings.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type {
  categoryInputSchema,
  categoryUpdateInputSchema,
  nomenclatureInputSchema,
  nomenclatureUpdateInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
} from "../content.schemas";
import { ContentCommonService } from "./content-common.service";

type CategoryInput = z.infer<typeof categoryInputSchema>;
type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
type NomenclatureInput = z.infer<typeof nomenclatureInputSchema>;
type NomenclatureUpdateInput = z.infer<typeof nomenclatureUpdateInputSchema>;
type PriceIndexInput = z.infer<typeof priceIndexInputSchema>;
type PriceIndexValueInput = z.infer<typeof priceIndexValueInputSchema>;

// Раздел «Индексы цен»: категории номенклатуры, индексы, временные ряды.
// Вынесен из ContentService. assertFunctionalAccess делегируется в ContentCommonService.
@Injectable()
export class IndicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly settings: PlatformSettingsService,
    private readonly common: ContentCommonService,
  ) {}

  async listIndices(user: RequestUser, paginationInput: PaginationInput = {}) {
    this.common.assertFunctionalAccess(user);

    const stagnationThreshold = await this.settings.getValue("indices.stagnation_threshold_percent");
    const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 100 });
    const where = { isActive: true };

    const [total, categories] = await this.prisma.$transaction([
      this.prisma.nomenclatureCategory.count({ where }),
      this.prisma.nomenclatureCategory.findMany({
        where,
        orderBy: { position: "asc" },
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          nomenclatures: {
            where: { isActive: true, priceIndex: { is: { status: ContentStatus.published } } },
            include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } },
            orderBy: { name: "asc" },
          },
        },
      }),
    ]);

    const items = categories.map((category) => ({
      ...category,
      nomenclatures: category.nomenclatures
        .map((item) => {
          const values =
            item.priceIndex?.values.map((value) => ({ date: value.date, price: Number(value.price) })) ?? [];
          const summary = summarizePriceIndex(values, new Date(), stagnationThreshold);
          return summary
            ? {
                ...item,
                priceIndex: item.priceIndex,
                summary,
                chart: {
                  "2W": filterPriceIndexPoints(values, 14),
                  "1M": filterPriceIndexPoints(values, 30),
                  "3M": filterPriceIndexPoints(values, 90),
                  "6M": filterPriceIndexPoints(values, 180),
                  "1Y": filterPriceIndexPoints(values, 365),
                  "2Y": filterPriceIndexPoints(values, 730),
                  "3Y": filterPriceIndexPoints(values, 1095),
                },
              }
            : null;
        })
        .filter(Boolean),
    }));

    return paginatedResponse(items, total, pagination);
  }

  async adminListIndices(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.nomenclatureCategory.count(),
      this.prisma.nomenclatureCategory.findMany({
        orderBy: { position: "asc" },
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          nomenclatures: { include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } } },
        },
      }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  async createCategory(input: CategoryInput, user: RequestUser) {
    const category = await this.prisma.nomenclatureCategory.create({
      data: { name: input.name, slug: slugify(input.name), position: input.position },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.create",
      entityType: "NomenclatureCategory",
      entityId: category.id,
    });

    return category;
  }

  async updateCategory(id: string, input: CategoryUpdateInput, user: RequestUser) {
    const existing = await this.prisma.nomenclatureCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Категория не найдена.");
    }

    const data: Prisma.NomenclatureCategoryUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      data.slug = slugify(input.name);
    }
    if (input.position !== undefined) data.position = input.position;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const category = await this.prisma.nomenclatureCategory.update({ where: { id }, data });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.update",
      entityType: "NomenclatureCategory",
      entityId: id,
      payload: input,
    });

    return category;
  }

  async deleteCategory(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.nomenclatureCategory.findUnique({
      where: { id },
      include: { _count: { select: { nomenclatures: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Категория не найдена.");
    }
    if (existing._count.nomenclatures > 0) {
      throw new ForbiddenException("Нельзя удалить категорию с привязанной номенклатурой.");
    }

    await this.prisma.nomenclatureCategory.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.delete",
      entityType: "NomenclatureCategory",
      entityId: id,
      comment: reason,
      payload: { name: existing.name, slug: existing.slug },
    });

    return { ok: true };
  }

  async createNomenclature(input: NomenclatureInput, user: RequestUser) {
    const nomenclature = await this.prisma.nomenclature.create({ data: input });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.create",
      entityType: "Nomenclature",
      entityId: nomenclature.id,
    });

    return nomenclature;
  }

  async updateNomenclature(id: string, input: NomenclatureUpdateInput, user: RequestUser) {
    const existing = await this.prisma.nomenclature.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Номенклатура не найдена.");
    }

    const nomenclature = await this.prisma.nomenclature.update({ where: { id }, data: input });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.update",
      entityType: "Nomenclature",
      entityId: id,
      payload: input,
    });

    return nomenclature;
  }

  async deleteNomenclature(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.nomenclature.findUnique({
      where: { id },
      include: { priceIndex: { include: { _count: { select: { values: true } } } } },
    });
    if (!existing) {
      throw new NotFoundException("Номенклатура не найдена.");
    }

    await this.prisma.nomenclature.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.delete",
      entityType: "Nomenclature",
      entityId: id,
      comment: reason,
      payload: {
        code: existing.code,
        name: existing.name,
        priceIndexId: existing.priceIndex?.id ?? null,
        priceValuesDeleted: existing.priceIndex?._count.values ?? 0,
      },
    });

    return { ok: true };
  }

  async createPriceIndex(input: PriceIndexInput, user: RequestUser) {
    const priceIndex = await this.prisma.priceIndex.create({ data: { ...input, createdById: user.id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.create",
      entityType: "PriceIndex",
      entityId: priceIndex.id,
    });

    return priceIndex;
  }

  async addPriceValue(id: string, input: PriceIndexValueInput, user: RequestUser) {
    const priceIndex = await this.prisma.priceIndex.findUnique({ where: { id }, select: { id: true } });
    if (!priceIndex) {
      throw new NotFoundException("Индекс не найден.");
    }

    const date = new Date(input.date);
    const existing = await this.prisma.priceIndexValue.findUnique({
      where: { priceIndexId_date: { priceIndexId: id, date } },
      select: { id: true, price: true },
    });

    const value = await this.prisma.priceIndexValue.upsert({
      where: { priceIndexId_date: { priceIndexId: id, date } },
      update: { price: input.price },
      create: { priceIndexId: id, date, price: input.price, createdById: user.id },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: existing ? "indices.value.update" : "indices.value.create",
      entityType: "PriceIndexValue",
      entityId: value.id,
      payload: {
        priceIndexId: id,
        date: date.toISOString(),
        beforePrice: existing?.price.toString() ?? null,
        afterPrice: value.price.toString(),
      },
    });

    return value;
  }

  async deletePriceValue(indexId: string, valueId: string, user: RequestUser) {
    const value = await this.prisma.priceIndexValue.findUnique({ where: { id: valueId } });
    if (!value || value.priceIndexId !== indexId) {
      throw new NotFoundException("Значение индекса не найдено.");
    }

    await this.prisma.priceIndexValue.delete({ where: { id: valueId } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.value.delete",
      entityType: "PriceIndexValue",
      entityId: valueId,
      payload: { priceIndexId: indexId, date: value.date.toISOString(), price: value.price.toString() },
    });

    return { ok: true };
  }

  async publishPriceIndex(id: string, user: RequestUser) {
    const existing = await this.prisma.priceIndex.findUnique({
      where: { id },
      include: { _count: { select: { values: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }
    if (existing._count.values === 0) {
      throw new ForbiddenException("Нельзя опубликовать индекс без значений.");
    }

    const priceIndex = await this.prisma.priceIndex.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.publish",
      entityType: "PriceIndex",
      entityId: id,
    });

    return priceIndex;
  }

  async unpublishPriceIndex(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.priceIndex.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }

    const priceIndex = await this.prisma.priceIndex.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.unpublish",
      entityType: "PriceIndex",
      entityId: id,
      comment: reason,
    });

    return priceIndex;
  }

  async deletePriceIndex(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.priceIndex.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }

    await this.prisma.priceIndex.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.delete",
      entityType: "PriceIndex",
      entityId: id,
      comment: reason,
      payload: { nomenclatureId: existing.nomenclatureId },
    });

    return { ok: true };
  }
}

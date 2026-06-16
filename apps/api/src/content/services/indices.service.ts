import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { summarizePriceIndex } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { PlatformSettingsService } from "../../admin/settings/platform-settings.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type {
  nomenclatureInputSchema,
  nomenclatureMoveInputSchema,
  nomenclatureUpdateInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
} from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import { buildPriceIndexChart } from "./indices-chart.helpers";
import { nextNomenclaturePosition, reorderNomenclature } from "./indices-position.helpers";

type NomenclatureInput = z.infer<typeof nomenclatureInputSchema>;
type NomenclatureMoveInput = z.infer<typeof nomenclatureMoveInputSchema>;
type NomenclatureUpdateInput = z.infer<typeof nomenclatureUpdateInputSchema>;
type PriceIndexInput = z.infer<typeof priceIndexInputSchema>;
type PriceIndexValueInput = z.infer<typeof priceIndexValueInputSchema>;

// Раздел «Индексы цен»: единый плоский список номенклатуры, индексы, временные
// ряды. Вынесен из ContentService. assertFunctionalAccess делегируется в ContentCommonService.
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
    const where = { isActive: true, priceIndex: { is: { status: ContentStatus.published } } };

    const [total, nomenclatures] = await this.prisma.$transaction([
      this.prisma.nomenclature.count({ where }),
      this.prisma.nomenclature.findMany({
        where,
        orderBy: [{ position: "asc" }, { name: "asc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } },
      }),
    ]);

    const items = nomenclatures
      .map((item) => {
        const values =
          item.priceIndex?.values.map((value) => ({ date: value.date, price: Number(value.price) })) ?? [];
        const summary = summarizePriceIndex(values, new Date(), stagnationThreshold);
        return summary
          ? {
              ...item,
              priceIndex: item.priceIndex,
              summary,
              chart: buildPriceIndexChart(values),
            }
          : null;
      })
      .filter(Boolean);

    return paginatedResponse(items, total, pagination);
  }

  async adminListIndices(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.nomenclature.count(),
      this.prisma.nomenclature.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } },
      }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  async createNomenclature(input: NomenclatureInput, user: RequestUser) {
    const { position, ...rest } = input;
    const nomenclature = await this.prisma.nomenclature.create({
      data: {
        ...rest,
        position: position ?? (await nextNomenclaturePosition(this.prisma)),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.create",
      entityType: "Nomenclature",
      entityId: nomenclature.id,
    });

    return nomenclature;
  }

  async moveNomenclature(id: string, input: NomenclatureMoveInput, user: RequestUser) {
    const existing = await this.prisma.nomenclature.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Номенклатура не найдена.");
    }

    const nomenclature = await this.prisma.$transaction(async (tx) => {
      await reorderNomenclature(tx, id, input.position);
      return tx.nomenclature.findUniqueOrThrow({ where: { id } });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.move",
      entityType: "Nomenclature",
      entityId: id,
      payload: {
        from: { position: existing.position },
        to: { position: input.position },
      },
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

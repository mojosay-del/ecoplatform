import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { paginatedResponse } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { adminJournalsQuerySchema } from "./admin-journals.schemas";
import type { z } from "zod";

type JournalsQuery = z.infer<typeof adminJournalsQuerySchema>;

type JournalEntityRef = {
  entityType: string;
  entityId: string;
  createdAt: Date;
  payload: Prisma.JsonValue | null;
};

type JournalEntitySummary = {
  type: string;
  typeLabel: string;
  title: string;
  subtitle?: string | null;
};

type JsonRecord = { [key: string]: Prisma.JsonValue | undefined };

const JOURNAL_ENTITY_TYPE_LABELS: Record<string, string> = {
  Chapter: "Глава курса",
  Company: "Компания",
  KnowledgeBaseArticle: "Статья базы знаний",
  LearningModule: "Курс",
  LegalDocument: "Юридический документ",
  Lesson: "Урок",
  ModerationCase: "Кейс модерации",
  NewsPost: "Новость",
  Nomenclature: "Номенклатура",
  NomenclatureCategory: "Категория номенклатуры",
  PlatformSetting: "Настройка платформы",
  PriceIndex: "Индекс цен",
  PriceIndexValue: "Значение индекса",
  Sanction: "Санкция",
  User: "Пользователь",
};

@Injectable()
export class AdminJournalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEntries(query: JournalsQuery) {
    const where: Prisma.AdminActionLogWhereInput = {};
    if (query.action) where.action = { contains: query.action, mode: "insensitive" };
    if (query.entityType) where.entityType = query.entityType;
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }

    const [total, entries] = await Promise.all([
      this.prisma.adminActionLog.count({ where }),
      this.prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
    ]);

    const entityMap = await this.buildEntitySummaryMap(entries);
    const actorIds = [...new Set(entries.map((entry) => entry.actorId))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    const items = entries.map((entry) => ({
      ...entry,
      actor: actorMap.get(entry.actorId) ?? null,
      entity: entityMap.get(entityKey(entry.entityType, entry.entityId)) ?? fallbackEntitySummary(entry),
    }));

    return paginatedResponse(items, total, query);
  }

  private async buildEntitySummaryMap(entries: JournalEntityRef[]) {
    const ids = (entityType: string) => idsFor(entries, entityType);
    const [
      companies,
      users,
      newsPosts,
      modules,
      chapters,
      lessons,
      articles,
      categories,
      nomenclatures,
      priceIndices,
      priceIndexValues,
      legalDocuments,
      moderationCases,
      sanctions,
    ] = await Promise.all([
      fetchIfAny(ids("Company"), (itemIds) =>
        this.prisma.company.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, organizationName: true, billingInn: true },
        }),
      ),
      fetchIfAny(ids("User"), (itemIds) =>
        this.prisma.user.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        }),
      ),
      fetchIfAny(ids("NewsPost"), (itemIds) =>
        this.prisma.newsPost.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, title: true, slug: true },
        }),
      ),
      fetchIfAny(ids("LearningModule"), (itemIds) =>
        this.prisma.learningModule.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, title: true, accessLevel: true },
        }),
      ),
      fetchIfAny(ids("Chapter"), (itemIds) =>
        this.prisma.chapter.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, title: true, module: { select: { title: true } } },
        }),
      ),
      fetchIfAny(ids("Lesson"), (itemIds) =>
        this.prisma.lesson.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            title: true,
            chapter: { select: { title: true, module: { select: { title: true } } } },
          },
        }),
      ),
      fetchIfAny(ids("KnowledgeBaseArticle"), (itemIds) =>
        this.prisma.knowledgeBaseArticle.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, title: true, slug: true },
        }),
      ),
      fetchIfAny(ids("NomenclatureCategory"), (itemIds) =>
        this.prisma.nomenclatureCategory.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        }),
      ),
      fetchIfAny(ids("Nomenclature"), (itemIds) =>
        this.prisma.nomenclature.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, code: true, name: true, category: { select: { name: true } } },
        }),
      ),
      fetchIfAny(ids("PriceIndex"), (itemIds) =>
        this.prisma.priceIndex.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, nomenclature: { select: { code: true, name: true } } },
        }),
      ),
      fetchIfAny(ids("PriceIndexValue"), (itemIds) =>
        this.prisma.priceIndexValue.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            date: true,
            price: true,
            priceIndex: { select: { nomenclature: { select: { code: true, name: true } } } },
          },
        }),
      ),
      fetchIfAny(ids("LegalDocument"), (itemIds) =>
        this.prisma.legalDocument.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, title: true, version: true },
        }),
      ),
      fetchIfAny(ids("ModerationCase"), (itemIds) =>
        this.prisma.moderationCase.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, entityType: true, createdAt: true },
        }),
      ),
      fetchIfAny(ids("Sanction"), (itemIds) =>
        this.prisma.sanction.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, type: true, targetType: true, appliedAt: true },
        }),
      ),
    ]);

    const map = new Map<string, JournalEntitySummary>();
    for (const item of companies) {
      addSummary(map, "Company", item.id, item.organizationName, item.billingInn ? `ИНН ${item.billingInn}` : null);
    }
    for (const item of users) {
      const name = formatUserName(item);
      addSummary(map, "User", item.id, name, name === item.email ? null : item.email);
    }
    for (const item of newsPosts) addSummary(map, "NewsPost", item.id, item.title, `/news/${item.slug}`);
    for (const item of modules) addSummary(map, "LearningModule", item.id, item.title, `Доступ: ${item.accessLevel}`);
    for (const item of chapters) addSummary(map, "Chapter", item.id, item.title, item.module.title);
    for (const item of lessons) {
      addSummary(map, "Lesson", item.id, item.title, `${item.chapter.module.title} · ${item.chapter.title}`);
    }
    for (const item of articles) {
      addSummary(map, "KnowledgeBaseArticle", item.id, item.title, `/knowledge-base/${item.slug}`);
    }
    for (const item of categories) addSummary(map, "NomenclatureCategory", item.id, item.name);
    for (const item of nomenclatures) {
      addSummary(map, "Nomenclature", item.id, item.name, `${item.code} · ${item.category.name}`);
    }
    for (const item of priceIndices) {
      addSummary(map, "PriceIndex", item.id, item.nomenclature.name, item.nomenclature.code);
    }
    for (const item of priceIndexValues) {
      const nomenclature = item.priceIndex.nomenclature;
      addSummary(
        map,
        "PriceIndexValue",
        item.id,
        `Значение индекса «${nomenclature.name}»`,
        `${formatDate(item.date)} · ${item.price.toString()} ₽/т`,
      );
    }
    for (const item of legalDocuments) {
      addSummary(map, "LegalDocument", item.id, item.title, `Версия ${item.version}`);
    }
    for (const item of moderationCases) {
      const typeLabel = JOURNAL_ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType;
      addSummary(map, "ModerationCase", item.id, "Кейс модерации", `${typeLabel} · ${formatDateTime(item.createdAt)}`);
    }
    for (const item of sanctions) {
      addSummary(
        map,
        "Sanction",
        item.id,
        `Санкция: ${item.type}`,
        `${item.targetType} · ${formatDateTime(item.appliedAt)}`,
      );
    }

    return map;
  }
}

function idsFor(entries: JournalEntityRef[], entityType: string) {
  return [...new Set(entries.filter((entry) => entry.entityType === entityType).map((entry) => entry.entityId))];
}

async function fetchIfAny<T>(ids: string[], fetcher: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  return ids.length > 0 ? fetcher(ids) : [];
}

function entityKey(entityType: string, entityId: string) {
  return `${entityType}:${entityId}`;
}

function addSummary(
  map: Map<string, JournalEntitySummary>,
  type: string,
  id: string,
  title: string,
  subtitle: string | null = null,
) {
  map.set(entityKey(type, id), {
    type,
    typeLabel: JOURNAL_ENTITY_TYPE_LABELS[type] ?? type,
    title,
    subtitle,
  });
}

function fallbackEntitySummary(
  entry: Pick<JournalEntityRef, "entityType" | "entityId" | "payload">,
): JournalEntitySummary {
  const typeLabel = JOURNAL_ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType;
  if (entry.entityType === "PlatformSetting") {
    return {
      type: entry.entityType,
      typeLabel,
      title: entry.entityId,
      subtitle: null,
    };
  }

  const payloadTitle = titleFromPayload(entry.payload);
  if (payloadTitle) {
    return {
      type: entry.entityType,
      typeLabel,
      title: payloadTitle,
      subtitle: "Запись удалена или недоступна",
    };
  }

  return {
    type: entry.entityType,
    typeLabel,
    title: typeLabel,
    subtitle: "ID доступен для аудита",
  };
}

function formatUserName(user: { firstName: string | null; lastName: string | null; email: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function titleFromPayload(payload: Prisma.JsonValue | null): string | null {
  const payloadObject = asPlainObject(payload);
  if (!payloadObject) return null;

  return (
    stringField(payloadObject, "title") ??
    stringField(payloadObject, "name") ??
    stringField(payloadObject, "organizationName") ??
    stringField(payloadObject, "email") ??
    titleFromNestedPayload(payloadObject, "after") ??
    titleFromNestedPayload(payloadObject, "before")
  );
}

function titleFromNestedPayload(payload: JsonRecord, key: string) {
  const nested = asPlainObject(payload[key]);
  if (!nested) return null;
  return (
    stringField(nested, "title") ??
    stringField(nested, "name") ??
    stringField(nested, "organizationName") ??
    stringField(nested, "email")
  );
}

function stringField(payload: JsonRecord, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPlainObject(value: Prisma.JsonValue | undefined | null): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

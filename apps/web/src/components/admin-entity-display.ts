import type { AdminJournalEntry } from "@ecoplatform/shared";
import { formatAuditValue } from "../lib/display-labels";

type PersonSummary = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ModerationEntitySummary =
  | {
      type: "news_comment";
      text?: string | null;
      createdAt?: string | Date | null;
      author?: PersonSummary | null;
      newsPost?: { title?: string | null } | null;
    }
  | { type: "news_post"; title?: string | null }
  | { type: "knowledge_article"; title?: string | null }
  | {
      type: "marketplace_listing";
      title?: string | null;
      status?: string | null;
      sellerCompany?: { organizationName?: string | null } | null;
    }
  | {
      type: "marketplace_review";
      text?: string | null;
      toCompany?: { organizationName?: string | null } | null;
      fromCompany?: { organizationName?: string | null } | null;
    };

type ModerationCaseDisplayInput = {
  entityType: string;
  entityId: string;
  createdAt?: string | Date | null;
  entity?: ModerationEntitySummary | null;
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
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
  knowledge_article: "статью базы знаний",
  marketplace_listing: "объявление",
  marketplace_review: "отзыв",
  news_comment: "комментарий",
  news_post: "новость",
};

export function formatModerationCaseTitle(item: ModerationCaseDisplayInput) {
  if (item.entity?.type === "news_comment") {
    const author = formatPersonInitials(item.entity.author);
    const createdAt = formatDateTime(item.entity.createdAt ?? item.createdAt);
    return `Жалоба на комментарий ${author}${createdAt ? ` от ${createdAt}` : ""}`;
  }

  if (item.entity?.type === "news_post") {
    return `Жалоба на новость «${item.entity.title ?? "без названия"}»`;
  }

  if (item.entity?.type === "knowledge_article") {
    return `Жалоба на статью «${item.entity.title ?? "без названия"}»`;
  }

  if (item.entity?.type === "marketplace_listing") {
    return `Жалоба на объявление${item.entity.title ? ` «${item.entity.title}»` : ""}`;
  }

  if (item.entity?.type === "marketplace_review") {
    const target = item.entity.toCompany?.organizationName;
    return `Жалоба на отзыв${target ? ` о компании «${target}»` : ""}`;
  }

  const fallback = ENTITY_TYPE_LABELS[item.entityType] ?? item.entityType;
  return `Кейс модерации: ${fallback}`;
}

export function formatModerationEntityPreview(item: ModerationCaseDisplayInput) {
  if (item.entity?.type === "news_comment") {
    const text = item.entity.text?.trim();
    if (text) return text;
    return item.entity.newsPost?.title ? `Комментарий к новости «${item.entity.newsPost.title}»` : "Комментарий";
  }

  if (item.entity?.type === "news_post") {
    return item.entity.title ?? "Новость";
  }

  if (item.entity?.type === "knowledge_article") {
    return item.entity.title ?? "Статья базы знаний";
  }

  if (item.entity?.type === "marketplace_listing") {
    return item.entity.title || "Объявление";
  }

  if (item.entity?.type === "marketplace_review") {
    return item.entity.text?.trim() || "Отзыв без комментария";
  }

  return "Контент недоступен или был удалён";
}

export function formatPersonInitials(person?: PersonSummary | null) {
  const initials = [person?.firstName, person?.lastName]
    .map((part) => part?.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .map((part) => `${part}.`)
    .join("");

  return initials || person?.email || "автора";
}

export function getJournalEntityDisplay(entry: Pick<AdminJournalEntry, "entityType" | "entityId" | "entity">) {
  const typeLabel = entry.entity?.typeLabel ?? ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType;
  return {
    typeLabel,
    title: entry.entity?.title ?? typeLabel,
    subtitle: formatJournalEntitySubtitle(entry.entity?.subtitle),
    technicalId: entry.entityId,
  };
}

function formatJournalEntitySubtitle(value?: string | null) {
  if (!value) return null;

  return value.replace(
    /Доступ: ([a-z_]+)/g,
    (_match, accessLevel: string) => `Доступ: ${formatAuditValue("accessLevel", accessLevel)}`,
  );
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

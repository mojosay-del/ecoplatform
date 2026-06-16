import { describe, expect, it, vi } from "vitest";
import { AdminJournalsService } from "./admin-journals.service";
import type { PrismaService } from "../../prisma/prisma.service";

type AdminActionLogRow = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  comment: string | null;
  payload: unknown;
  createdAt: Date;
};

describe("AdminJournalsService", () => {
  it("adds human-readable entity summaries to journal rows", async () => {
    const createdAt = new Date("2026-05-25T10:00:00.000Z");
    const prisma = createPrismaMock({
      entries: [
        logEntry({ id: "log-news", entityType: "NewsPost", entityId: "news-1", createdAt }),
        logEntry({ id: "log-lesson", entityType: "Lesson", entityId: "lesson-1", createdAt }),
        logEntry({
          id: "log-deleted-module",
          entityType: "LearningModule",
          entityId: "module-deleted",
          payload: { title: "Экономика и учёт" },
          createdAt,
        }),
      ],
      newsPosts: [{ id: "news-1", title: "Рынок макулатуры", slug: "rynok-makulatury" }],
      lessons: [
        {
          id: "lesson-1",
          title: "Сортировка сырья",
          chapter: { title: "Основы", module: { title: "Закупка сырья" } },
        },
      ],
    });
    const service = new AdminJournalsService(prisma);

    const result = await service.listEntries({ limit: 20, offset: 0 } as never);

    expect(result.items[0].entity).toEqual({
      type: "NewsPost",
      typeLabel: "Новость",
      title: "Рынок макулатуры",
      subtitle: "/news/rynok-makulatury",
    });
    expect(result.items[1].entity).toEqual({
      type: "Lesson",
      typeLabel: "Урок",
      title: "Сортировка сырья",
      subtitle: "Закупка сырья · Основы",
    });
    expect(result.items[2].entity).toEqual({
      type: "LearningModule",
      typeLabel: "Курс",
      title: "Экономика и учёт",
      subtitle: "Запись удалена или недоступна",
    });
    expect(result.items[0].actor).toEqual({
      id: "admin-1",
      firstName: "Админ",
      lastName: "Платформы",
      email: "admin@example.com",
    });
  });

  it("uses a readable fallback when the entity type is unknown", async () => {
    const prisma = createPrismaMock({
      entries: [logEntry({ id: "log-external", entityType: "ExternalThing", entityId: "cltech123" })],
    });
    const service = new AdminJournalsService(prisma);

    const result = await service.listEntries({ limit: 20, offset: 0 } as never);

    expect(result.items[0].entity).toEqual({
      type: "ExternalThing",
      typeLabel: "ExternalThing",
      title: "ExternalThing",
      subtitle: "ID доступен для аудита",
    });
  });
});

function logEntry(overrides: Partial<AdminActionLogRow> = {}): AdminActionLogRow {
  return {
    id: "log-1",
    actorId: "admin-1",
    action: "news.update",
    entityType: "NewsPost",
    entityId: "news-1",
    comment: null,
    payload: null,
    createdAt: new Date("2026-05-25T10:00:00.000Z"),
    ...overrides,
  };
}

function createPrismaMock({
  entries,
  newsPosts = [],
  lessons = [],
}: {
  entries: AdminActionLogRow[];
  newsPosts?: Array<{ id: string; title: string; slug: string }>;
  lessons?: Array<{ id: string; title: string; chapter: { title: string; module: { title: string } } }>;
}) {
  const emptyFindMany = vi.fn().mockResolvedValue([]);
  return {
    adminActionLog: {
      count: vi.fn().mockResolvedValue(entries.length),
      findMany: vi.fn().mockResolvedValue(entries),
    },
    company: { findMany: emptyFindMany },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "admin-1", firstName: "Админ", lastName: "Платформы", email: "admin@example.com" }]),
    },
    newsPost: { findMany: vi.fn().mockResolvedValue(newsPosts) },
    learningModule: { findMany: emptyFindMany },
    chapter: { findMany: emptyFindMany },
    lesson: { findMany: vi.fn().mockResolvedValue(lessons) },
    knowledgeBaseArticle: { findMany: emptyFindMany },
    nomenclature: { findMany: emptyFindMany },
    priceIndex: { findMany: emptyFindMany },
    priceIndexValue: { findMany: emptyFindMany },
    legalDocument: { findMany: emptyFindMany },
    moderationCase: { findMany: emptyFindMany },
    sanction: { findMany: emptyFindMany },
  } as unknown as PrismaService;
}

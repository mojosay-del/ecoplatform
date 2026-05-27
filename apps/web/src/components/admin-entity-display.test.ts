import { describe, expect, it } from "vitest";
import {
  formatModerationCaseTitle,
  formatModerationEntityPreview,
  formatPersonInitials,
  getJournalEntityDisplay,
} from "./admin-entity-display";

describe("admin entity display helpers", () => {
  it("formats a moderation complaint around the human subject instead of the raw cuid", () => {
    const item = {
      entityType: "news_comment",
      entityId: "cltech1234567890",
      entity: {
        type: "news_comment" as const,
        text: "Оскорбительный комментарий",
        createdAt: "2026-05-25T14:32:00",
        author: { firstName: "Алексей", lastName: "Соколов", email: "a@example.com" },
        newsPost: { title: "Рынок сырья" },
      },
    };

    expect(formatModerationCaseTitle(item)).toBe("Жалоба на комментарий А.С. от 25.05.2026, 14:32");
    expect(formatModerationEntityPreview(item)).toBe("Оскорбительный комментарий");
  });

  it("falls back to email when initials are unavailable", () => {
    expect(formatPersonInitials({ email: "unknown@example.com" })).toBe("unknown@example.com");
    expect(formatPersonInitials(null)).toBe("автора");
  });

  it("formats journal entity summary and keeps the technical id separate", () => {
    const display = getJournalEntityDisplay({
      entityType: "Lesson",
      entityId: "cllesson123",
      entity: {
        type: "Lesson",
        typeLabel: "Урок",
        title: "Как сортировать сырьё",
        subtitle: "Закупка сырья · Основы",
      },
    });

    expect(display).toEqual({
      typeLabel: "Урок",
      title: "Как сортировать сырьё",
      subtitle: "Закупка сырья · Основы",
      technicalId: "cllesson123",
    });
  });

  it("localizes enum values inside journal entity subtitles", () => {
    const display = getJournalEntityDisplay({
      entityType: "LearningModule",
      entityId: "clmodule123",
      entity: {
        type: "LearningModule",
        typeLabel: "Курс",
        title: "Закупка сырья",
        subtitle: "Доступ: basic",
      },
    });

    expect(display.subtitle).toBe("Доступ: Базовый доступ");
  });
});

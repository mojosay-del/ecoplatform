import { describe, expect, it } from "vitest";
import {
  canAccessLearningLevel,
  canOpenFunctionalSections,
  demoEndsAt,
  effectivePlan,
  summarizePriceIndex,
  slugify,
  validateLessonBlocks,
  validateNewsBlocks,
} from "../src";

describe("MVP access rules", () => {
  it("treats active demo as basic access", () => {
    const now = new Date("2026-05-20T10:00:00.000Z");
    const company = {
      status: "demo" as const,
      demoEndsAt: demoEndsAt(now),
      subscriptionPlan: null,
      subscriptionEndsAt: null,
    };

    expect(canOpenFunctionalSections(company, now)).toBe(true);
    expect(canAccessLearningLevel(company, "basic", false, now)).toBe(true);
    expect(canAccessLearningLevel(company, "extended", false, now)).toBe(false);
  });

  it("closes functional sections after demo expires", () => {
    const now = new Date("2026-05-20T10:00:00.000Z");
    const company = {
      status: "demo" as const,
      demoEndsAt: new Date("2026-05-20T09:59:59.000Z"),
      subscriptionPlan: null,
      subscriptionEndsAt: null,
    };

    expect(canOpenFunctionalSections(company, now)).toBe(false);
  });

  it("keeps access while a paid subscription is still in the future", () => {
    const now = new Date("2026-05-20T10:00:00.000Z");
    const company = {
      status: "active" as const,
      demoEndsAt: null,
      subscriptionPlan: "basic" as const,
      subscriptionEndsAt: new Date("2026-06-20T10:00:00.000Z"),
    };

    expect(canOpenFunctionalSections(company, now)).toBe(true);
    expect(effectivePlan(company, now)).toBe("basic");
  });

  // Регрессия: истёкшая платная подписка (компания переведена hourly-cron'ом
  // в past_due) НЕ должна сохранять функциональный доступ. До фикса
  // `isSubscriptionActive` короткозамыкался на `status === "past_due"` и
  // оставлял доступ открытым бессрочно.
  it("closes functional sections after a paid subscription expires (past_due)", () => {
    const now = new Date("2026-05-20T10:00:00.000Z");
    const company = {
      status: "past_due" as const,
      demoEndsAt: null,
      subscriptionPlan: "basic" as const,
      subscriptionEndsAt: new Date("2026-05-20T09:59:59.000Z"),
    };

    expect(canOpenFunctionalSections(company, now)).toBe(false);
    expect(effectivePlan(company, now)).toBe(null);
  });

  // Граничный случай: admin вручную выставил past_due, но подписка ещё
  // действует — доступ сохраняется по дате окончания, а не по статусу.
  it("honours a still-valid subscription even when status is past_due", () => {
    const now = new Date("2026-05-20T10:00:00.000Z");
    const company = {
      status: "past_due" as const,
      demoEndsAt: null,
      subscriptionPlan: "extended" as const,
      subscriptionEndsAt: new Date("2026-06-20T10:00:00.000Z"),
    };

    expect(canOpenFunctionalSections(company, now)).toBe(true);
    expect(effectivePlan(company, now)).toBe("extended");
  });
});

describe("price index helpers", () => {
  it("calculates weekly trend from the closest previous point", () => {
    const summary = summarizePriceIndex(
      [
        { date: "2026-05-06", price: 100 },
        { date: "2026-05-20", price: 120 },
      ],
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(summary?.weeklyChange).toBe(20);
    expect(summary?.trend).toBe("growth");
  });
});

describe("slug helper", () => {
  it("transliterates Russian headings", () => {
    expect(slugify("Гофрокартон и бумага")).toBe("gofrokarton-i-bumaga");
  });
});

describe("content block validation", () => {
  it("rejects file blocks in news", () => {
    const result = validateNewsBlocks([
      {
        type: "file",
        payload: { fileId: "file-1", displayName: "ГОСТ.pdf" },
      },
    ]);

    expect(result.ok).toBe(false);
  });

  it("rejects audio blocks in lessons", () => {
    const result = validateLessonBlocks([
      {
        type: "audio",
        payload: { fileId: "audio-1" },
      },
    ]);

    expect(result.ok).toBe(false);
  });

  it("accepts lesson task blocks in lessons", () => {
    const result = validateLessonBlocks([
      {
        type: "lesson_tasks",
        payload: { tasks: [{ title: "Посмотреть урок", description: "Дочитайте до конца" }] },
      },
    ]);

    expect(result.ok).toBe(true);
  });
});

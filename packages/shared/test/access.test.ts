import { describe, expect, it } from "vitest";
import {
  canAccessLearningLevel,
  canOpenFunctionalSections,
  demoEndsAt,
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

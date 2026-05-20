import { describe, expect, it } from "vitest";
import { canAccessLearningLevel, canOpenFunctionalSections, demoEndsAt, summarizePriceIndex, slugify } from "../src";

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

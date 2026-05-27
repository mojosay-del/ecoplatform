import { describe, expect, it } from "vitest";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { formatIndexWeeklyChange, getIndexAnchorId, getIndexMovementSummary } from "./index-movement-summary";

function indexItem(id: string, weeklyChange: number | null): NomenclatureListItem {
  return {
    id,
    name: `Индекс ${id}`,
    code: id.toUpperCase(),
    unit: "₽/т",
    priceIndex: {
      id: `price-${id}`,
      status: "published",
    },
    summary: {
      currentPrice: 100,
      currentDate: new Date("2026-05-27T00:00:00.000Z"),
      weeklyChange,
      trend: weeklyChange === null ? null : weeklyChange > 0 ? "growth" : weeklyChange < 0 ? "fall" : "stagnation",
    },
    chart: {},
  };
}

describe("index movement summary", () => {
  it("keeps top three rising and falling weekly movements", () => {
    const summary = getIndexMovementSummary([
      indexItem("growth-small", 1.2),
      indexItem("growth-large", 7.4),
      indexItem("growth-medium", 3.5),
      indexItem("growth-extra", 2.1),
      indexItem("fall-small", -0.8),
      indexItem("fall-large", -6.2),
      indexItem("fall-medium", -2.4),
      indexItem("fall-extra", -1.5),
      indexItem("stagnation", 0),
      indexItem("unknown", null),
    ]);

    expect(summary.rising.map((row) => row.item.id)).toEqual(["growth-large", "growth-medium", "growth-extra"]);
    expect(summary.falling.map((row) => row.item.id)).toEqual(["fall-large", "fall-medium", "fall-extra"]);
  });

  it("formats anchors and weekly percent labels for the UI", () => {
    expect(getIndexAnchorId("abc123")).toBe("index-abc123");
    expect(formatIndexWeeklyChange(4.25)).toBe("+4,3%");
    expect(formatIndexWeeklyChange(-2)).toBe("-2%");
  });
});

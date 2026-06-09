import { describe, expect, it } from "vitest";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { formatIndexMovementChange, getIndexAnchorId, getIndexMovementSummary } from "./index-movement-summary";

function indexItem(id: string, change: number | null, chartKey: "2W" | "3Y" = "2W"): NomenclatureListItem {
  const basePrice = 100;
  const currentPrice = change === null ? basePrice : Number((basePrice * (1 + change / 100)).toFixed(2));

  return {
    id,
    name: `Индекс ${id}`,
    code: id.toUpperCase(),
    unit: "₽/т",
    position: 0,
    priceIndex: {
      id: `price-${id}`,
      status: "published",
    },
    summary: {
      currentPrice,
      currentDate: new Date("2026-05-27T00:00:00.000Z"),
      weeklyChange: change,
      trend: change === null ? null : change > 0 ? "growth" : change < 0 ? "fall" : "stagnation",
    },
    chart:
      change === null
        ? {}
        : {
            [chartKey]: [
              { date: "2026-05-13T00:00:00.000Z", price: basePrice },
              { date: "2026-05-27T00:00:00.000Z", price: currentPrice },
            ],
          },
  };
}

describe("index movement summary", () => {
  it("keeps top three rising and falling period movements", () => {
    const summary = getIndexMovementSummary(
      [
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
      ],
      "2W",
      3,
    );

    expect(summary.rising.map((row) => row.item.id)).toEqual(["growth-large", "growth-medium", "growth-extra"]);
    expect(summary.falling.map((row) => row.item.id)).toEqual(["fall-large", "fall-medium", "fall-extra"]);
    expect(summary.rising[0]?.currentPrice).toBe(107.4);
  });

  it("uses full history for a selected period instead of dropping sparse series", () => {
    const summary = getIndexMovementSummary(
      [indexItem("growth", 10, "3Y"), indexItem("fall", -5, "3Y"), indexItem("flat", 0, "3Y")],
      "1M",
    );

    expect(summary.rising.map((row) => row.item.id)).toEqual(["growth"]);
    expect(summary.falling.map((row) => row.item.id)).toEqual(["fall"]);
    expect(summary.flat.map((row) => row.item.id)).toEqual(["flat"]);
  });

  it("formats anchors and period percent labels for the UI", () => {
    expect(getIndexAnchorId("abc123")).toBe("index-abc123");
    expect(formatIndexMovementChange(4.25)).toBe("+4,3%");
    expect(formatIndexMovementChange(-2)).toBe("-2%");
  });
});

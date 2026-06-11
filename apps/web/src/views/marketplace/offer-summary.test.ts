import { describe, expect, it } from "vitest";
import {
  buildOfferSummary,
  formatPricePerTonInput,
  parsePricePerTon,
  type OfferSummaryPosition,
} from "./offer-summary";

const position = (id: string, nomenclatureName: string, weightKg: number): OfferSummaryPosition => ({
  id,
  nomenclatureName,
  weightKg,
});

describe("marketplace offer summary", () => {
  it("counts priced positions and totals the selected listing weight", () => {
    const summary = buildOfferSummary(
      [position("paper", "Макулатура", 500), position("film", "Плёнка", 1200), position("pet", "ПЭТ", 80)],
      {
        paper: "10 000",
        film: "9 500",
        pet: "",
      },
    );

    expect(summary.selectedCount).toBe(2);
    expect(summary.totalCount).toBe(3);
    expect(summary.totalRub).toBe(16400);
    expect(summary.lines).toMatchObject([
      { id: "paper", pricePerTonRub: 10000, totalRub: 5000 },
      { id: "film", pricePerTonRub: 9500, totalRub: 11400 },
      { id: "pet", pricePerTonRub: null, totalRub: null },
    ]);
  });

  it("keeps empty and zero prices as not interested", () => {
    expect(parsePricePerTon("")).toBeNull();
    expect(parsePricePerTon("0")).toBeNull();
  });

  it("normalizes pasted prices to integer rubles per ton", () => {
    expect(formatPricePerTonInput("12 200 ₽/т")).toMatch(/^12\s200$/);
  });
});

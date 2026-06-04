import { describe, expect, it } from "vitest";
import { priceIndexValueInputSchema } from "./content.schemas";

describe("priceIndexValueInputSchema", () => {
  it("accepts integer ruble price per tonne", () => {
    expect(
      priceIndexValueInputSchema.safeParse({
        date: "2026-06-04T00:00:00.000Z",
        price: 12300,
      }).success,
    ).toBe(true);
  });

  it("rejects decimal price values", () => {
    expect(
      priceIndexValueInputSchema.safeParse({
        date: "2026-06-04T00:00:00.000Z",
        price: 12.3,
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { MarketplaceListingPositionSummary } from "@ecoplatform/shared";
import { compactPositionsTitle } from "./listing-title";

const position = (nomenclatureName: string): MarketplaceListingPositionSummary => ({
  nomenclatureId: nomenclatureName,
  nomenclatureName,
  categorySlug: "makulatura",
  weightKg: 100,
  form: "pressed",
});

describe("marketplace listing title", () => {
  it("limits modal title to two positions and the hidden count", () => {
    expect(compactPositionsTitle([position("Картон"), position("Газеты"), position("Журналы")])).toBe(
      "Картон, Газеты и ещё 1",
    );
  });

  it("uses a neutral modal title when listing has no positions", () => {
    expect(compactPositionsTitle([])).toBe("Объявление");
  });
});

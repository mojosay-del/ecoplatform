import { describe, expect, it } from "vitest";
import {
  LEGAL_DOCUMENT_BODY_MAX_LENGTH,
  LEGAL_DOCUMENT_TITLE_MAX_LENGTH,
  LISTING_MAX_POSITIONS,
  createListingDtoSchema,
  createOfferDtoSchema,
  legalDocumentCreateDtoSchema,
} from "../src";

function listingPositions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    nomenclatureId: `nomenclature-${index}`,
    weightKg: 100,
  }));
}

function offerPositions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    listingPositionId: `position-${index}`,
    pricePerTonRub: 10_000,
  }));
}

describe("DTO size limits", () => {
  it("limits listing positions to the configured maximum", () => {
    const baseListing = {
      address: { city: "Moscow", formatted: "Moscow" },
      contactPhone: "+79991234567",
    };

    expect(
      createListingDtoSchema.safeParse({ ...baseListing, positions: listingPositions(LISTING_MAX_POSITIONS) }).success,
    ).toBe(true);
    expect(
      createListingDtoSchema.safeParse({ ...baseListing, positions: listingPositions(LISTING_MAX_POSITIONS + 1) })
        .success,
    ).toBe(false);
  });

  it("limits offer positions to the configured maximum", () => {
    const baseOffer = {
      priceCondition: "from_place",
      contactPhone: "+79991234567",
    };

    expect(
      createOfferDtoSchema.safeParse({ ...baseOffer, positions: offerPositions(LISTING_MAX_POSITIONS) }).success,
    ).toBe(true);
    expect(
      createOfferDtoSchema.safeParse({ ...baseOffer, positions: offerPositions(LISTING_MAX_POSITIONS + 1) }).success,
    ).toBe(false);
  });

  it("rejects oversized legal document title and body", () => {
    const baseDocument = {
      type: "privacy_policy",
      version: "1.0.0",
      title: "Privacy policy",
      body: "<p>Legal text</p>",
    };

    expect(
      legalDocumentCreateDtoSchema.safeParse({
        ...baseDocument,
        title: "A".repeat(LEGAL_DOCUMENT_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      legalDocumentCreateDtoSchema.safeParse({
        ...baseDocument,
        body: "A".repeat(LEGAL_DOCUMENT_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

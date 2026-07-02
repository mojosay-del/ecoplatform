import { describe, expect, it } from "vitest";
import {
  LEGAL_DOCUMENT_BODY_MAX_LENGTH,
  LEGAL_DOCUMENT_TITLE_MAX_LENGTH,
  LISTING_MAX_POSITIONS,
  accountContactChangeApplyDtoSchema,
  accountContactChangeStartDtoSchema,
  accountContactChangeVerifyDtoSchema,
  accountProfileUpdateDtoSchema,
  createListingDtoSchema,
  createOfferDtoSchema,
  legalDocumentCreateDtoSchema,
  registerDtoSchema,
  registrationResendDtoSchema,
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
  it("allows registration without gender", () => {
    const result = registerDtoSchema.safeParse({
      organizationName: "ООО Тест",
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      phone: "+79991234567",
      email: "user@test.local",
      password: "Password1234",
      acceptedDocumentIds: [],
    });

    expect(result.success).toBe(true);
  });

  it("validates registration resend payloads", () => {
    expect(registrationResendDtoSchema.safeParse({ verificationId: "v1" }).success).toBe(true);
    expect(registrationResendDtoSchema.safeParse({ verificationId: "" }).success).toBe(false);
  });

  it("validates partial profile updates but rejects an empty patch", () => {
    expect(accountProfileUpdateDtoSchema.safeParse({ firstName: "Иван", lastName: "Ферум" }).success).toBe(true);
    expect(accountProfileUpdateDtoSchema.safeParse({ gender: null }).success).toBe(true);
    expect(accountProfileUpdateDtoSchema.safeParse({}).success).toBe(false);
    expect(accountProfileUpdateDtoSchema.safeParse({ firstName: "" }).success).toBe(false);
  });

  it("validates contact-change payloads", () => {
    expect(accountContactChangeStartDtoSchema.safeParse({ field: "email" }).success).toBe(true);
    expect(accountContactChangeVerifyDtoSchema.safeParse({ verificationId: "v1", code: "1234" }).success).toBe(true);
    expect(
      accountContactChangeApplyDtoSchema.safeParse({
        field: "email",
        verificationId: "v1",
        email: "user@example.test",
      }).success,
    ).toBe(true);
    expect(
      accountContactChangeApplyDtoSchema.safeParse({
        field: "phone",
        verificationId: "v1",
        phone: "+79991234567",
      }).success,
    ).toBe(true);

    expect(accountContactChangeStartDtoSchema.safeParse({ field: "password" }).success).toBe(false);
    expect(accountContactChangeVerifyDtoSchema.safeParse({ verificationId: "v1", code: "12ab" }).success).toBe(false);
    expect(
      accountContactChangeApplyDtoSchema.safeParse({ field: "email", verificationId: "v1", email: "bad" }).success,
    ).toBe(false);
    expect(
      accountContactChangeApplyDtoSchema.safeParse({ field: "phone", verificationId: "v1", phone: "123" }).success,
    ).toBe(false);
  });

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

  it("validates listing typical load range", () => {
    const baseListing = {
      positions: listingPositions(1),
      address: { city: "Moscow", formatted: "Moscow" },
      contactPhone: "+79991234567",
    };

    expect(
      createListingDtoSchema.safeParse({
        ...baseListing,
        typicalLoadMinKg: 12_000,
        typicalLoadMaxKg: 17_000,
      }).success,
    ).toBe(true);
    expect(
      createListingDtoSchema.safeParse({
        ...baseListing,
        typicalLoadMinKg: 17_000,
        typicalLoadMaxKg: 12_000,
      }).success,
    ).toBe(false);
    expect(
      createListingDtoSchema.safeParse({
        ...baseListing,
        typicalLoadMinKg: 12_000,
      }).success,
    ).toBe(false);
    expect(
      createListingDtoSchema.safeParse({
        ...baseListing,
        typicalLoadMinKg: 500,
        typicalLoadMaxKg: 1_000,
      }).success,
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

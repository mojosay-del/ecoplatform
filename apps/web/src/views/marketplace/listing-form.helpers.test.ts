import { describe, expect, it } from "vitest";
import type { CompanyAddress, MarketplaceAddressSuggestion } from "@ecoplatform/shared";
import { addressDraftToDto, addressSuggestionToDraft, companyAddressToDraft } from "../../lib/company-address";
import {
  buildListingDto,
  clientValidationError,
  emptyPosition,
  type ListingFormValues,
  NO_PACKAGING,
  parsePackaging,
  parsePhone,
  positionWeightKg,
  serializePackaging,
  totalPositionWeightKg,
  uniqueOptions,
} from "./listing-form.helpers";

function validValues(overrides: Partial<ListingFormValues> = {}): ListingFormValues {
  return {
    positions: [{ ...emptyPosition(), nomenclatureId: "nom-1", weightTons: "1.5" }],
    addressCountry: "RU",
    city: "Казань",
    region: "Татарстан",
    street: "Баумана",
    building: "1",
    postcode: "420000",
    phoneCountry: "ru",
    phoneDigits: "9012345678",
    readyNow: true,
    readinessDate: "",
    description: "  Описание  ",
    paymentTerms: "",
    typicalLoadMinTons: "",
    typicalLoadMaxTons: "",
    media: [{ fileId: "f1", kind: "photo" }],
    ...overrides,
  };
}

describe("listing form helpers: упаковка", () => {
  it("parsePackaging чистит легаси «Тюки» и пустое до значения по умолчанию", () => {
    expect(parsePackaging("Палет, Тюки, Обмотка")).toEqual(["Палет", "Обмотка"]);
    expect(parsePackaging("")).toEqual([NO_PACKAGING]);
    expect(parsePackaging(null)).toEqual([NO_PACKAGING]);
    expect(parsePackaging("Мусор")).toEqual([NO_PACKAGING]);
  });

  it("serializePackaging склеивает или отдаёт null", () => {
    expect(serializePackaging(["Палет", "Обмотка"])).toBe("Палет, Обмотка");
    expect(serializePackaging([])).toBeNull();
    expect(serializePackaging([" "])).toBeNull();
  });
});

describe("listing form helpers: вес", () => {
  it("positionWeightKg переводит тонны в кг, мусор → 0", () => {
    expect(positionWeightKg({ ...emptyPosition(), weightTons: "2" })).toBe(2000);
    expect(positionWeightKg({ ...emptyPosition(), weightTons: "abc" })).toBe(0);
    expect(positionWeightKg({ ...emptyPosition(), weightTons: "-1" })).toBe(0);
  });

  it("totalPositionWeightKg суммирует позиции", () => {
    expect(
      totalPositionWeightKg([
        { ...emptyPosition(), weightTons: "1" },
        { ...emptyPosition(), weightTons: "0.5" },
      ]),
    ).toBe(1500);
  });
});

describe("listing form helpers: разное", () => {
  it("uniqueOptions убирает дубли по value (стабильный порядок)", () => {
    expect(
      uniqueOptions([
        { value: "a", label: "A" },
        { value: "a", label: "A2" },
        { value: "b", label: "B" },
      ]),
    ).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ]);
  });

  it("parsePhone разбирает +7 и падает в ru по умолчанию", () => {
    expect(parsePhone("+7 901 234-56-78")).toEqual({ countryId: "ru", digits: "9012345678" });
  });
});

describe("listing form helpers: сборка DTO", () => {
  it("переводит тонны в кг, тримит адрес, проставляет null-поля", () => {
    const dto = buildListingDto(
      validValues({ typicalLoadMinTons: "12", typicalLoadMaxTons: "17", paymentTerms: "  нал  " }),
    );
    expect(dto.positions[0]?.weightKg).toBe(1500);
    expect(dto.address.city).toBe("Казань");
    expect(dto.typicalLoadKg).toBe(17000);
    expect(dto.typicalLoadMinKg).toBe(12000);
    expect(dto.typicalLoadMaxKg).toBe(17000);
    expect(dto.paymentTerms).toBe("нал");
    expect(dto.description).toBe("Описание");
    expect(dto.readinessDate).toBeNull();
    expect(dto.contactPhone).toMatch(/^\+7/);
  });

  it("сохраняет выбранную страну адреса", () => {
    const dto = buildListingDto(validValues({ addressCountry: "BY", city: "Минск", region: "Минская область" }));
    expect(dto.address.country).toBe("Беларусь");
    expect(dto.address.city).toBe("Минск");
  });

  it("typicalLoadKg и диапазон = null при пустом поле; readinessDate из даты при readyNow=false", () => {
    const dto = buildListingDto(validValues({ readyNow: false, readinessDate: "2026-07-01" }));
    expect(dto.typicalLoadKg).toBeNull();
    expect(dto.typicalLoadMinKg).toBeNull();
    expect(dto.typicalLoadMaxKg).toBeNull();
    expect(dto.readinessDate).not.toBeNull();
  });
});

describe("company address helpers", () => {
  const companyAddress: CompanyAddress = {
    id: "addr-1",
    country: "Беларусь",
    region: "Минская область",
    city: "Минск",
    street: "Немига",
    building: "5",
    apartment: null,
    postcode: "220000",
    latitude: "53.9023000",
    longitude: "27.5619000",
    formatted: "Беларусь, Минск, Немига, 5",
    source: "dadata",
  };

  it("переводит адрес компании в черновик формы", () => {
    expect(companyAddressToDraft(companyAddress)).toEqual({
      countryCode: "BY",
      query: "Беларусь, Минск, Немига, 5",
      city: "Минск",
      region: "Минская область",
      street: "Немига",
      building: "5",
      postcode: "220000",
    });
  });

  it("переводит выбранную подсказку в DTO адреса", () => {
    const suggestion: MarketplaceAddressSuggestion = {
      value: "Беларусь, Минск, Немига, 5",
      address: companyAddress,
    };
    expect(addressDraftToDto(addressSuggestionToDraft(suggestion))).toMatchObject({
      country: "Беларусь",
      city: "Минск",
      street: "Немига",
      building: "5",
      formatted: "Беларусь, Минск, Немига, 5",
    });
  });
});

describe("listing form helpers: валидация", () => {
  it("требует адрес, телефон, сырьё и вес позиций", () => {
    expect(clientValidationError(validValues({ city: "  " }), false)).toMatch(/адрес/i);
    expect(clientValidationError(validValues({ phoneDigits: "" }), false)).toMatch(/телефон/i);
    expect(clientValidationError(validValues({ positions: [{ ...emptyPosition(), weightTons: "1" }] }), false)).toMatch(
      /вид сырья/i,
    );
    expect(
      clientValidationError(validValues({ positions: [{ ...emptyPosition(), nomenclatureId: "n" }] }), false),
    ).toMatch(/вес/i);
  });

  it("при публикации проверяет минимальный суммарный вес", () => {
    const tooLight = validValues({
      positions: [{ ...emptyPosition(), nomenclatureId: "n", weightTons: "0.01" }],
    });
    expect(clientValidationError(tooLight, true)).toMatch(/минимум/i);
    expect(clientValidationError(tooLight, false)).toBeNull();
  });

  it("валидная форма → null", () => {
    expect(clientValidationError(validValues(), true)).toBeNull();
  });

  it("проверяет диапазон загрузки в машину", () => {
    expect(
      clientValidationError(validValues({ typicalLoadMinTons: "12", typicalLoadMaxTons: "17" }), false),
    ).toBeNull();
    expect(clientValidationError(validValues({ typicalLoadMinTons: "12" }), false)).toMatch(/диапазон/i);
    expect(clientValidationError(validValues({ typicalLoadMinTons: "17", typicalLoadMaxTons: "12" }), false)).toMatch(
      /до/i,
    );
    expect(clientValidationError(validValues({ typicalLoadMinTons: "0", typicalLoadMaxTons: "12" }), false)).toMatch(
      /списка/i,
    );
  });
});

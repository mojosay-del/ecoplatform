// Чистая логика формы объявления: типы, константы, разбор/сборка значений и
// клиентская валидация. Без React/JSX — переиспользуется хуком формы и покрыто
// unit-тестами (listing-form.helpers.test.ts). UI-части — в listing-form-*.tsx.

import type { CreateListingDto, ListingContaminationCondition, ListingMoistureCondition } from "@ecoplatform/shared";
import { LISTING_MIN_WEIGHT_KG } from "@ecoplatform/shared";
import { PHONE_COUNTRIES } from "../../components/auth/constants";
import type { PhoneCountryId } from "../../components/auth/types";
import { formatPhoneFull, getPhoneCountry, normalizePhoneDigits } from "../../components/auth/utils";
import { formatWeight } from "./listing-format";

export const PACKAGING_OPTIONS = ["Без упаковки", "Палет", "Проложки", "Обмотка"] as const;
export const NO_PACKAGING = "Без упаковки";

export type SelectOption = { value: string; label: string };

export const MOISTURE_OPTIONS: Array<SelectOption & { value: ListingMoistureCondition }> = [
  { value: "dry", label: "Сухое" },
  { value: "slightly_wet", label: "Немного влажное" },
  { value: "wet", label: "Влажное" },
];
export const CONTAMINATION_OPTIONS: Array<SelectOption & { value: ListingContaminationCondition }> = [
  { value: "clean", label: "Без включений" },
  { value: "may_have_inclusions", label: "Могут быть иные включения" },
  { value: "has_inclusions", label: "Есть иные включения" },
];

export const ADDRESS_SEARCH_ID = "mp-address-search";
export const ADDRESS_SUGGEST_MIN_LENGTH = 3;
export const ADDRESS_SUGGEST_DEBOUNCE_MS = 300;

export type AddressSuggestState = "idle" | "loading" | "open" | "empty" | "failed";

export type PositionForm = {
  category: string;
  nomenclatureId: string;
  weightTons: string;
  form: "pressed" | "loose";
  moistureCondition: ListingMoistureCondition | "";
  contaminationCondition: ListingContaminationCondition | "";
  packaging: string[];
};

export type MediaItem = { fileId: string; kind: "photo" | "video" };

export type MediaUploadProgress = {
  fileName: string;
  fraction: number;
  index: number;
  total: number;
  kind: "photo" | "video";
};

// Значения полей формы — то, что нужно для сборки DTO и валидации.
export type ListingFormValues = {
  positions: PositionForm[];
  city: string;
  region: string;
  street: string;
  building: string;
  postcode: string;
  phoneCountry: PhoneCountryId;
  phoneDigits: string;
  readyNow: boolean;
  readinessDate: string;
  description: string;
  paymentTerms: string;
  typicalLoadTons: string;
  media: MediaItem[];
};

export function emptyPosition(): PositionForm {
  return {
    category: "",
    nomenclatureId: "",
    weightTons: "",
    form: "loose",
    moistureCondition: "",
    contaminationCondition: "",
    packaging: [NO_PACKAGING],
  };
}

export function fieldClass(value: string | boolean | null | undefined): string {
  return `mp-field${value ? " is-filled" : ""}`;
}

export function uniqueOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

// Разбор полного номера в страну + национальные цифры (для префилла при правке).
export function parsePhone(full: string): { countryId: PhoneCountryId; digits: string } {
  const digitsOnly = full.replace(/\D/g, "");
  for (const country of PHONE_COUNTRIES) {
    const dial = country.dialCode.replace(/\D/g, "");
    if (digitsOnly.startsWith(dial)) {
      const local = normalizePhoneDigits(full, country);
      if (local.length === country.nationalLength) return { countryId: country.id as PhoneCountryId, digits: local };
    }
  }
  return { countryId: "ru", digits: normalizePhoneDigits(full, getPhoneCountry("ru")) };
}

export function parsePackaging(value: string | null): string[] {
  const allowed = new Set<string>(PACKAGING_OPTIONS);
  const parts = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && part !== "Тюки" && allowed.has(part));
  return parts.length > 0 ? parts : [NO_PACKAGING];
}

export function serializePackaging(value: string[]): string | null {
  const cleaned = value.map((part) => part.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

export function positionWeightKg(position: PositionForm): number {
  const weightTons = Number(position.weightTons);
  return Number.isFinite(weightTons) && weightTons > 0 ? weightTons * 1000 : 0;
}

export function totalPositionWeightKg(positions: PositionForm[]): number {
  return positions.reduce((sum, position) => sum + positionWeightKg(position), 0);
}

export function buildListingDto(values: ListingFormValues): CreateListingDto {
  return {
    positions: values.positions.map((position) => ({
      nomenclatureId: position.nomenclatureId,
      weightKg: (Number(position.weightTons) || 0) * 1000,
      form: position.form,
      moistureCondition: position.moistureCondition || null,
      contaminationCondition: position.contaminationCondition || null,
      packaging: serializePackaging(position.packaging),
    })),
    address: {
      country: "Россия",
      city: values.city.trim(),
      region: values.region.trim() || null,
      street: values.street.trim() || null,
      building: values.building.trim() || null,
      postcode: values.postcode.trim() || null,
    },
    contactPhone: formatPhoneFull(getPhoneCountry(values.phoneCountry), values.phoneDigits),
    description: values.description.trim() || null,
    paymentTerms: values.paymentTerms.trim() || null,
    typicalLoadKg: values.typicalLoadTons.trim() === "" ? null : (Number(values.typicalLoadTons) || 0) * 1000,
    readyNow: values.readyNow,
    readinessDate: values.readyNow ? null : values.readinessDate ? new Date(values.readinessDate).toISOString() : null,
    media: values.media,
  };
}

export function clientValidationError(values: ListingFormValues, publish: boolean): string | null {
  if (!values.city.trim()) return "Выберите адрес отгрузки из подсказки Яндекса.";
  if (!formatPhoneFull(getPhoneCountry(values.phoneCountry), values.phoneDigits)) {
    return "Укажите контактный телефон полностью.";
  }
  for (const position of values.positions) {
    if (!position.nomenclatureId) return "Выберите вид сырья во всех позициях.";
    if (!(Number(position.weightTons) > 0)) return "Укажите вес во всех позициях.";
  }
  if (publish && totalPositionWeightKg(values.positions) < LISTING_MIN_WEIGHT_KG) {
    return `Суммарный вес объявления — минимум ${formatWeight(LISTING_MIN_WEIGHT_KG)} для публикации.`;
  }
  return null;
}

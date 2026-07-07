import type { AddressDto, CompanyAddress, MarketplaceAddressSuggestion } from "@ecoplatform/shared";

export type AddressCountryCode = "RU" | "BY";

export type AddressDraft = {
  countryCode: AddressCountryCode;
  query: string;
  city: string;
  region: string;
  street: string;
  building: string;
  postcode: string;
};

export function addressCountryName(code: AddressCountryCode): string {
  return code === "BY" ? "Беларусь" : "Россия";
}

export function addressCountryCodeFromName(country?: string | null): AddressCountryCode {
  return country?.trim().toLowerCase().startsWith("бел") ? "BY" : "RU";
}

export function emptyAddressDraft(countryCode: AddressCountryCode = "RU"): AddressDraft {
  return {
    countryCode,
    query: "",
    city: "",
    region: "",
    street: "",
    building: "",
    postcode: "",
  };
}

export function companyAddressToDraft(address?: CompanyAddress | null): AddressDraft {
  if (!address) return emptyAddressDraft();
  return {
    countryCode: addressCountryCodeFromName(address.country),
    query: address.formatted,
    city: address.city,
    region: address.region ?? "",
    street: address.street ?? "",
    building: address.building ?? "",
    postcode: address.postcode ?? "",
  };
}

export function addressSuggestionToDraft(suggestion: MarketplaceAddressSuggestion): AddressDraft {
  return {
    ...companyAddressToDraft(suggestion.address),
    query: suggestion.value || suggestion.address.formatted,
  };
}

export function addressDraftHasSelectedAddress(draft: AddressDraft): boolean {
  return Boolean(draft.query.trim() && draft.city.trim());
}

export function addressDraftToDto(draft: AddressDraft): AddressDto | null {
  if (!addressDraftHasSelectedAddress(draft)) return null;
  return {
    country: addressCountryName(draft.countryCode),
    city: draft.city.trim(),
    region: draft.region.trim() || null,
    street: draft.street.trim() || null,
    building: draft.building.trim() || null,
    postcode: draft.postcode.trim() || null,
    formatted: draft.query.trim(),
  };
}

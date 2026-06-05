import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, VERIFICATION_CODE_LENGTH } from "./constants";
import type { PhoneCountry, PhoneCountryId } from "./types";

export function getPhoneCountry(id: PhoneCountryId) {
  return PHONE_COUNTRIES.find((country) => country.id === id) ?? DEFAULT_PHONE_COUNTRY;
}

export function normalizePhoneDigits(value: string, country: PhoneCountry) {
  const digits = value.replace(/\D/g, "");
  const dialDigits = country.dialCode.replace(/\D/g, "");
  let localDigits = digits;

  if (digits.length > country.nationalLength && digits.startsWith(dialDigits)) {
    localDigits = digits.slice(dialDigits.length);
  } else if (country.id === "ru" && digits.length > country.nationalLength && digits.startsWith("8")) {
    localDigits = digits.slice(1);
  }

  return localDigits.slice(0, country.nationalLength);
}

export function formatPhoneLocal(digits: string, country: PhoneCountry) {
  const parts: string[] = [];
  let cursor = 0;

  for (const groupLength of country.groups) {
    if (cursor >= digits.length) break;
    const part = digits.slice(cursor, cursor + groupLength);
    if (part) parts.push(part);
    cursor += groupLength;
  }

  if (parts.length <= 2) return parts.join(" ");

  return `${parts.slice(0, 2).join(" ")}-${parts.slice(2).join("-")}`;
}

export function formatPhoneFull(country: PhoneCountry, digits: string) {
  return digits.length === country.nationalLength ? `${country.dialCode}${digits}` : "";
}

export function isPasswordStrong(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH && /[A-Za-zА-Яа-яЁё]/.test(password) && /[0-9]/.test(password);
}

export function passwordStrength(password: string) {
  const checks = [password.length >= MIN_PASSWORD_LENGTH, /[A-Za-zА-Яа-яЁё]/.test(password), /[0-9]/.test(password)];

  return checks.filter(Boolean).length;
}

export function normalizeEmailValue(value: string) {
  return value.trim().toLowerCase();
}

export function emptyVerificationDigits() {
  return Array.from({ length: VERIFICATION_CODE_LENGTH }, () => "");
}

import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES } from "../../components/auth/constants";
import type { PhoneCountryId } from "../../components/auth/types";

export function phoneStateFromValue(value: string): { countryId: PhoneCountryId; digits: string } {
  const digits = value.replace(/\D/g, "");
  const country =
    PHONE_COUNTRIES.find((option) => {
      const dialDigits = option.dialCode.replace(/\D/g, "");
      const localDigits = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
      return value.startsWith(option.dialCode) && localDigits.length <= option.nationalLength;
    }) ?? DEFAULT_PHONE_COUNTRY;
  const dialDigits = country.dialCode.replace(/\D/g, "");
  const localDigits = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
  return {
    countryId: country.id as PhoneCountryId,
    digits: localDigits.slice(0, country.nationalLength),
  };
}

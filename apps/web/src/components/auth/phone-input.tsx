"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AM, AZ, BY, KG, KZ, MD, RU, TJ, TM, UZ } from "country-flag-icons/react/3x2";
import { PHONE_COUNTRIES } from "./constants";
import type { PhoneCountryId } from "./types";
import { formatPhoneFull, formatPhoneLocal, getPhoneCountry, normalizePhoneDigits } from "./utils";
import "./phone-input.css";

const FLAG_BY_ID: Record<PhoneCountryId, typeof RU> = {
  ru: RU,
  by: BY,
  kz: KZ,
  am: AM,
  kg: KG,
  uz: UZ,
  tj: TJ,
  az: AZ,
  md: MD,
  tm: TM,
};

function CountryFlag({ id }: { id: PhoneCountryId }) {
  const Flag = FLAG_BY_ID[id];
  return (
    <span className="phone-country-flag" aria-hidden="true">
      <Flag />
    </span>
  );
}

export function PhoneInput({
  name,
  countryId,
  digits,
  onCountryChange,
  onDigitsChange,
}: {
  name: string;
  countryId: PhoneCountryId;
  digits: string;
  onCountryChange: (countryId: PhoneCountryId) => void;
  onDigitsChange: (digits: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const countryButtonRef = useRef<HTMLButtonElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const country = getPhoneCountry(countryId);
  const displayValue = formatPhoneLocal(digits, country);
  const fullValue = formatPhoneFull(country, digits);

  useEffect(() => {
    const button = countryButtonRef.current;
    const input = phoneInputRef.current;
    if (button && input) {
      input.style.paddingLeft = `${button.offsetWidth + 8}px`;
    }
  }, [countryId]);

  function setPhoneValidity(input: HTMLInputElement, valueDigits: string) {
    input.setCustomValidity(
      valueDigits.length === 0 || valueDigits.length === country.nationalLength
        ? ""
        : `Введите ${country.nationalLength} цифр номера для страны ${country.name}.`,
    );
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextDigits = normalizePhoneDigits(event.currentTarget.value, country);
    onDigitsChange(nextDigits);
    setPhoneValidity(event.currentTarget, nextDigits);
  }

  function selectCountry(nextCountryId: PhoneCountryId) {
    const nextCountry = getPhoneCountry(nextCountryId);
    onCountryChange(nextCountryId);
    onDigitsChange(digits.slice(0, nextCountry.nationalLength));
    setOpen(false);
  }

  return (
    <div
      className="phone-input-wrap"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={countryButtonRef}
        className="phone-country"
        type="button"
        aria-label={`Выбрать страну телефона. Сейчас ${country.name} ${country.dialCode}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CountryFlag id={country.id as PhoneCountryId} />
        <span className="phone-country-code">{country.dialCode}</span>
      </button>
      {open ? (
        <div className="phone-country-menu" role="listbox" aria-label="Страна телефона">
          {PHONE_COUNTRIES.map((option) => (
            <button
              key={option.id}
              className="phone-country-option"
              type="button"
              role="option"
              aria-selected={option.id === country.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCountry(option.id as PhoneCountryId)}
            >
              <CountryFlag id={option.id as PhoneCountryId} />
              <span className="phone-country-name">{option.name}</span>
              <span className="phone-country-option-code">{option.dialCode}</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={phoneInputRef}
        className="input phone-input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={country.placeholder}
        value={displayValue}
        onChange={onChange}
        onBlur={(event) => setPhoneValidity(event.currentTarget, digits)}
        onInvalid={(event) => {
          if (digits.length > 0 && digits.length < country.nationalLength) {
            setPhoneValidity(event.currentTarget, digits);
          }
        }}
        title={`Введите номер: ${country.dialCode} ${country.placeholder}`}
        required
      />
      <input type="hidden" name={name} value={fullValue} />
    </div>
  );
}

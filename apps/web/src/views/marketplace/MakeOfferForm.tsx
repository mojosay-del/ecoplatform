"use client";

// Форма ценового предложения покупателя на странице объявления. Цена указывается
// по каждой позиции (пусто = «не интересует»), плюс условие цены, город (для
// «на воротах») и контактный телефон, который раскроется продавцу после акцепта.

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { CreateOfferDto, MarketplaceListingDetail, PriceCondition } from "@ecoplatform/shared";
import { DEFAULT_PHONE_COUNTRY } from "../../components/auth/constants";
import { PhoneInput } from "../../components/auth/phone-input";
import type { PhoneCountryId } from "../../components/auth/types";
import { formatPhoneFull, getPhoneCountry } from "../../components/auth/utils";
import { ApiError, api } from "../../lib/api";
import { formatWeight } from "./listing-ui";
import { buildOfferSummary, formatPricePerTonInput } from "./offer-summary";
import { formatPrice } from "./offer-ui";

const PRICE_CONDITION_OPTIONS: Array<{ value: PriceCondition; label: string }> = [
  { value: "from_place", label: "Цена с места (вывожу сам)" },
  { value: "at_gate", label: "Цена на воротах (доставка ко мне)" },
];

function formatRubles(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function MakeOfferForm({
  listing,
  onSubmitted,
}: {
  listing: MarketplaceListingDetail;
  onSubmitted: () => void;
}) {
  const [priceCondition, setPriceCondition] = useState<PriceCondition>("from_place");
  const [city, setCity] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryId>(DEFAULT_PHONE_COUNTRY.id as PhoneCountryId);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const offerSummary = buildOfferSummary(listing.positions, prices);

  function updatePrice(positionId: string, value: string) {
    if (/[.,]/.test(value)) {
      setError("Цена указывается целым числом рублей за тонну, например 12 200.");
      return;
    }
    setError(null);
    setPrices((prev) => ({ ...prev, [positionId]: formatPricePerTonInput(value) }));
  }

  async function submit() {
    setError(null);
    setDuplicate(false);
    const contactPhone = formatPhoneFull(getPhoneCountry(phoneCountry), phoneDigits);
    if (!contactPhone) {
      setError("Укажите контактный телефон полностью.");
      return;
    }
    if (priceCondition === "at_gate" && !city.trim()) {
      setError("Для условия «цена на воротах» укажите город доставки.");
      return;
    }
    const positions = offerSummary.lines.map((position) => ({
      listingPositionId: position.id,
      pricePerTonRub: position.pricePerTonRub,
    }));
    if (offerSummary.selectedCount === 0) {
      setError("Укажите цену хотя бы по одной позиции.");
      return;
    }

    setSaving(true);
    try {
      const dto: CreateOfferDto = {
        priceCondition,
        city: city.trim() || null,
        contactPhone,
        positions,
      };
      await api.marketplace.offers.create(listing.id, dto);
      setDone(true);
      onSubmitted();
    } catch (submitError) {
      const message = submitError instanceof ApiError ? submitError.message : "Не удалось отправить предложение.";
      if (submitError instanceof ApiError && submitError.status === 400 && message.includes("уже есть")) {
        setDuplicate(true);
      }
      setError(message);
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="mp-offer-form">
        <p className="mp-hint">
          Предложение отправлено. Статус — в разделе <Link href="/marketplace/offers">«Мои предложения»</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-offer-form">
      <h3>Сделать предложение</h3>
      <div className="mp-offer-positions">
        {offerSummary.lines.map((position) => (
          <div className="mp-field" key={position.id}>
            <label>
              {position.nomenclatureName} ({formatWeight(position.weightKg)}) — ₽/т
            </label>
            <input
              className="mp-input"
              type="text"
              inputMode="numeric"
              placeholder="не интересует"
              value={prices[position.id] ?? ""}
              onChange={(event) => updatePrice(position.id, event.target.value)}
            />
            <span className={`mp-price-state${position.pricePerTonRub == null ? " is-muted" : ""}`}>
              {position.pricePerTonRub == null ? "Не интересует" : "В ставке"}
            </span>
          </div>
        ))}
      </div>
      <div className="mp-offer-summary" aria-live="polite">
        <div className="mp-offer-summary-top">
          <span>
            Ставка по {offerSummary.selectedCount} из {offerSummary.totalCount} позиций
          </span>
          <strong>Итого {formatRubles(offerSummary.totalRub)}</strong>
        </div>
        <div className="mp-offer-summary-list">
          {offerSummary.lines.map((position) => (
            <div
              className={`mp-offer-summary-line${position.pricePerTonRub == null ? " is-muted" : ""}`}
              key={position.id}
            >
              <span>{position.nomenclatureName}</span>
              <strong>
                {position.pricePerTonRub == null
                  ? "не интересует"
                  : `${formatPrice(position.pricePerTonRub)} · ${formatRubles(position.totalRub ?? 0)}`}
              </strong>
            </div>
          ))}
        </div>
      </div>
      <div className="mp-grid-2">
        <div className="mp-field">
          <label>Условие цены</label>
          <PriceConditionSelect value={priceCondition} onChange={setPriceCondition} />
        </div>
        {priceCondition === "at_gate" ? (
          <div className="mp-field">
            <label>Город доставки</label>
            <input className="mp-input" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
        ) : null}
        <div className="mp-field">
          <label>Контактный телефон</label>
          <PhoneInput
            name="offerContactPhone"
            countryId={phoneCountry}
            digits={phoneDigits}
            onCountryChange={setPhoneCountry}
            onDigitsChange={setPhoneDigits}
          />
        </div>
      </div>
      {error ? (
        <p className="mp-error">
          {error}
          {duplicate ? (
            <>
              {" "}
              <Link href="/marketplace/offers">Открыть мои предложения</Link>.
            </>
          ) : null}
        </p>
      ) : null}
      <button className="button" type="button" disabled={saving} onClick={submit}>
        Отправить предложение
      </button>
    </div>
  );
}

function PriceConditionSelect({
  value,
  onChange,
}: {
  value: PriceCondition;
  onChange: (value: PriceCondition) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = PRICE_CONDITION_OPTIONS.find((option) => option.value === value) ?? PRICE_CONDITION_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(nextValue: PriceCondition) {
    onChange(nextValue);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  }

  return (
    <div className={`mp-popover-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="mp-popover-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <span>{selected.label}</span>
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <div className="mp-popover-select-list" role="listbox" aria-label="Условие цены">
          {PRICE_CONDITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`mp-popover-select-option${option.value === value ? " is-selected" : ""}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

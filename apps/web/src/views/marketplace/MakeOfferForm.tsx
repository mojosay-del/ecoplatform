"use client";

// Форма ценового предложения покупателя на странице объявления. Цена указывается
// по каждой позиции (пусто = «не интересует»), плюс условие цены, город (для
// «на воротах») и контактный телефон, который раскроется продавцу после акцепта.

import Link from "next/link";
import { useState } from "react";
import type { CreateOfferDto, MarketplaceListingDetail } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { formatWeight } from "./listing-ui";

export function MakeOfferForm({
  listing,
  onSubmitted,
}: {
  listing: MarketplaceListingDetail;
  onSubmitted: () => void;
}) {
  const [priceCondition, setPriceCondition] = useState<"from_place" | "at_gate">("from_place");
  const [city, setCity] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  async function submit() {
    setError(null);
    if (!contactPhone.trim()) {
      setError("Укажите контактный телефон.");
      return;
    }
    if (priceCondition === "at_gate" && !city.trim()) {
      setError("Для условия «цена на воротах» укажите город доставки.");
      return;
    }
    const positions = listing.positions.map((position) => ({
      listingPositionId: position.id,
      pricePerKg: prices[position.id]?.trim() ? Number(prices[position.id]) : null,
    }));
    if (!positions.some((position) => position.pricePerKg != null && position.pricePerKg > 0)) {
      setError("Укажите цену хотя бы по одной позиции.");
      return;
    }

    setSaving(true);
    try {
      const dto: CreateOfferDto = {
        priceCondition,
        city: city.trim() || null,
        contactPhone: contactPhone.trim(),
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
          Предложение отправлено. Статус — в разделе{" "}
          <Link href="/marketplace/offers">«Мои предложения»</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-offer-form">
      <h3>Сделать предложение</h3>
      <div className="mp-offer-positions">
        {listing.positions.map((position) => (
          <div className="mp-field" key={position.id}>
            <label>
              {position.nomenclatureName} ({formatWeight(position.weightKg)}) — ₽/кг
            </label>
            <input
              className="mp-input"
              type="number"
              min="0"
              placeholder="не интересует"
              value={prices[position.id] ?? ""}
              onChange={(event) => setPrices((prev) => ({ ...prev, [position.id]: event.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mp-grid-2">
        <div className="mp-field">
          <label>Условие цены</label>
          <select
            className="mp-select"
            value={priceCondition}
            onChange={(event) => setPriceCondition(event.target.value as "from_place" | "at_gate")}
          >
            <option value="from_place">Цена с места (вывожу сам)</option>
            <option value="at_gate">Цена на воротах (доставка ко мне)</option>
          </select>
        </div>
        {priceCondition === "at_gate" ? (
          <div className="mp-field">
            <label>Город доставки</label>
            <input className="mp-input" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
        ) : null}
        <div className="mp-field">
          <label>Контактный телефон</label>
          <input
            className="mp-input"
            value={contactPhone}
            placeholder="+7 999 123-45-67"
            onChange={(event) => setContactPhone(event.target.value)}
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

"use client";

// Панель предложений на странице объявления — видна владельцу (продавцу). Имена
// покупателей скрыты до акцепта; после «Принять» раскрываются контакты и
// появляются кнопки «Договорились / Не договорились».

import { useState } from "react";
import type { ListingOfferItem, PriceCondition } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { useApiQuery } from "../shared";
import { OfferStatusBadge, formatPrice } from "./offer-ui";
import { ReviewForm } from "./ReviewForm";

function offerConditionText(condition: PriceCondition, region: string | null, revealedCity: string | null): string {
  if (condition === "at_gate") {
    if (revealedCity) {
      return `Доставка к покупателю: ${revealedCity}`;
    }
    return region ? `Доставка к покупателю: ${region}` : "Доставка к покупателю: город скрыт";
  }
  return "Покупатель забирает сырьё сам";
}

export function ListingOffersPanel({ listingId, onChanged }: { listingId: string; onChanged?: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const { data: offers, state } = useApiQuery(
    `listing-offers-${listingId}-${refresh}`,
    () => api.marketplace.offers.forListing(listingId),
    [] as ListingOfferItem[],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setRefresh((value) => value + 1);
      onChanged?.();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "Не удалось выполнить действие.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = offers.filter((offer) => offer.status === "active" || offer.status === "accepted");

  return (
    <div className="mp-offers-panel">
      <h3>Предложения{state === "ready" ? ` (${pending.length})` : ""}</h3>
      {error ? <p className="mp-error">{error}</p> : null}
      {state === "loading" ? <p className="mp-hint">Загрузка предложений…</p> : null}
      {state === "ready" && offers.length === 0 ? <p className="mp-hint">Пока нет предложений.</p> : null}

      {offers.map((offer) => {
        const pricedPositions = offer.positions.filter((position) => position.pricePerTonRub != null);
        const revealedCity = offer.buyerContact?.city ?? null;
        return (
          <div className="mp-offer-card" key={offer.id}>
            <div className="mp-offer-top">
              <div>
                <p className="mp-offer-eyebrow">Предложение покупателя</p>
                <h4>{offerConditionText(offer.priceCondition, offer.region, revealedCity)}</h4>
              </div>
              <OfferStatusBadge status={offer.status} />
            </div>
            <div className="mp-offer-price-list">
              {pricedPositions.map((position) => (
                <div key={position.listingPositionId}>
                  <span>{position.nomenclatureName}</span>
                  <strong>{formatPrice(position.pricePerTonRub)}</strong>
                </div>
              ))}
            </div>
            {offer.buyerRating != null ? (
              <p className="mp-hint">Рейтинг покупателя: {offer.buyerRating.toFixed(1)} из 5</p>
            ) : null}
            {offer.buyerContact ? (
              <div className="mp-offer-contact">
                <span>Покупатель</span>
                <strong>{offer.buyerContact.companyName}</strong>
                <span>
                  Телефон: {offer.buyerContact.phone}
                  {offer.buyerContact.city ? ` · ${offer.buyerContact.city}` : ""}
                </span>
              </div>
            ) : (
              <p className="mp-offer-hidden">Покупатель и контакты откроются после принятия предложения.</p>
            )}
            <div className="mp-row-actions" style={{ justifyContent: "flex-start" }}>
              {offer.status === "active" ? (
                <button
                  className="button"
                  disabled={busyId === offer.id}
                  onClick={() => act(offer.id, () => api.marketplace.offers.accept(offer.id))}
                  type="button"
                >
                  Принять
                </button>
              ) : null}
              {offer.status === "accepted" && offer.dealResult === null ? (
                <>
                  <button
                    className="button"
                    disabled={busyId === offer.id}
                    onClick={() => act(offer.id, () => api.marketplace.offers.deal(offer.id, "agreed"))}
                    type="button"
                  >
                    Договорились
                  </button>
                  <button
                    className="button secondary"
                    disabled={busyId === offer.id}
                    onClick={() => act(offer.id, () => api.marketplace.offers.deal(offer.id, "not_agreed"))}
                    type="button"
                  >
                    Не договорились
                  </button>
                </>
              ) : null}
              {offer.canReview ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => setReviewingId(reviewingId === offer.id ? null : offer.id)}
                >
                  Оставить отзыв
                </button>
              ) : null}
            </div>
            {reviewingId === offer.id ? (
              <ReviewForm
                offerId={offer.id}
                direction="seller_to_buyer"
                onDone={() => {
                  setReviewingId(null);
                  setRefresh((value) => value + 1);
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

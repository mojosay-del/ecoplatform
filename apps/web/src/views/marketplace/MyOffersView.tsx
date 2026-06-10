"use client";

// Кабинет покупателя «Мои предложения»: статусы, отзыв активных предложений,
// раскрытые контакты продавца после акцепта.

import Link from "next/link";
import { useState } from "react";
import type { MyOfferItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { ApiError, api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { OfferStatusBadge, PRICE_CONDITION_LABEL, formatPrice } from "./offer-ui";
import { ReviewForm } from "./ReviewForm";

export function MyOffersView() {
  const [refresh, setRefresh] = useState(0);
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery(`my-offers-${refresh}`, () => api.marketplace.offers.mine({ limit: 100 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<MyOfferItem>);

  const offers = page.items;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  if (state === "unauthenticated") {
    return <AuthRequired title="Мои предложения" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Мои предложения" />;
  }
  if (state === "error") {
    return <ErrorState title="Мои предложения" message={errorMessage} />;
  }

  async function withdraw(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.marketplace.offers.withdraw(id);
      setRefresh((value) => value + 1);
    } catch (withdrawError) {
      setError(withdrawError instanceof ApiError ? withdrawError.message : "Не удалось отозвать предложение.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <div className="mp-toolbar">
          <PageHeader title="Мои предложения" subtitle="Ваши ценовые предложения по объявлениям площадки." />
          <Link className="button secondary" href="/marketplace">
            К ленте
          </Link>
        </div>

        {error ? <p className="mp-error">{error}</p> : null}

        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка…
          </p>
        ) : offers.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            У вас пока нет предложений. Найдите объявление в <Link href="/marketplace">ленте</Link>.
          </p>
        ) : (
          <div className="mp-mylist">
            {offers.map((offer) => (
              <div key={offer.id}>
                <div className="mp-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div className="mp-row-main">
                    <Link className="mp-row-title" href={`/marketplace/${offer.listingId}`}>
                      {offer.listingSummary || "Объявление"}
                    </Link>
                    <span className="mp-row-sub">
                      {PRICE_CONDITION_LABEL[offer.priceCondition]} ·{" "}
                      {offer.positions
                        .filter((position) => position.pricePerKg != null)
                        .map((position) => `${position.nomenclatureName} ${formatPrice(position.pricePerKg)}`)
                        .join(", ")}
                    </span>
                    {offer.sellerContact ? (
                      <span className="mp-revealed">
                        Продавец: {offer.sellerContact.companyName}, тел. {offer.sellerContact.phone}
                      </span>
                    ) : null}
                  </div>
                  <div className="mp-row-actions">
                    <OfferStatusBadge status={offer.status} />
                    {offer.status === "active" ? (
                      <button
                        className="button secondary"
                        disabled={busyId === offer.id}
                        onClick={() => withdraw(offer.id)}
                        type="button"
                      >
                        Отозвать
                      </button>
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
                </div>
                {reviewingId === offer.id ? (
                  <div style={{ marginTop: 8 }}>
                    <ReviewForm
                      offerId={offer.id}
                      direction="buyer_to_seller"
                      onDone={() => {
                        setReviewingId(null);
                        setRefresh((value) => value + 1);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

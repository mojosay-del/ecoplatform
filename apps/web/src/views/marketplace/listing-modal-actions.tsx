"use client";

import type { RefObject } from "react";
import { Mail } from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { pluralizeRu } from "../../lib/ru-plural";
import { CompanyReviews } from "./CompanyReviews";
import { ListingOffersPanel } from "./ListingOffersPanel";
import { MakeOfferForm } from "./MakeOfferForm";
import { ReportControl } from "./ReportControl";

export function ListingModalActions({
  actionRef,
  isBuyer,
  listing,
  onListingChanged,
}: {
  actionRef: RefObject<HTMLDivElement | null>;
  isBuyer: boolean;
  listing: MarketplaceListingDetail;
  onListingChanged: () => void;
}) {
  return (
    <>
      {!listing.isOwner ? (
        <div className="mp-modal-columns">
          <div className="mp-modal-action" ref={actionRef}>
            {/* Соц-доказательство без раскрытия цен: только количество. */}
            <p className="mp-auction-count">
              <Mail aria-hidden="true" size={14} />
              {listing.offerCount > 0
                ? `Подано ${listing.offerCount} ${pluralizeRu(listing.offerCount, "предложение", "предложения", "предложений")}`
                : isBuyer && listing.status === "active"
                  ? "Предложений пока нет — будьте первым"
                  : "Предложений пока нет"}
            </p>
            {isBuyer && listing.status === "active" ? (
              <>
                <MakeOfferForm listing={listing} onSubmitted={onListingChanged} />
                <p className="mp-modal-reveal">
                  После отправки предложения ваш телефон станет доступен заготовителю только после его согласия.
                </p>
              </>
            ) : (
              <p className="mp-hint">
                {listing.status === "active"
                  ? "Предложения отправляют покупатели — трейдеры и переработчики."
                  : "Объявление сейчас неактивно."}
              </p>
            )}

            <details className="mp-auction-explainer">
              <summary>Как работает закрытый аукцион</summary>
              <ul>
                <li>Ставки других покупателей скрыты — каждый предлагает свою цену вслепую.</li>
                <li>Продавец видит цены без названий компаний и выбирает лучшее предложение.</li>
                <li>Контакты сторон раскрываются только после принятия предложения.</li>
              </ul>
            </details>

            {listing.status === "active" ? (
              <ReportControl
                entityType="marketplace_listing"
                entityId={listing.id}
                label="Пожаловаться на объявление"
              />
            ) : null}
          </div>

          <aside className="mp-modal-reviews" aria-label="Рейтинг и отзывы продавца">
            <CompanyReviews companyId={listing.seller.companyId} />
          </aside>
        </div>
      ) : null}

      {listing.isOwner ? (
        <div className="mp-modal-section">
          <ListingOffersPanel listingId={listing.id} onChanged={onListingChanged} />
        </div>
      ) : null}

      {/* Мобильная CTA-полоса: прокручивает к форме ставки (≤760px). */}
      {!listing.isOwner && isBuyer && listing.status === "active" ? (
        <div className="mp-modal-cta-bar">
          <button
            className="button"
            type="button"
            onClick={() => actionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Сделать предложение
          </button>
        </div>
      ) : null}
    </>
  );
}

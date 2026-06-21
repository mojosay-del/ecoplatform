"use client";

import { CalendarDays, Layers, Package, Scale, Truck } from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { compactPositionsTitle } from "./listing-title";
import { formatDateTime, listingForms, listingProductFacts, listingTotalWeight } from "./listing-modal.helpers";
import { formatWeight } from "./listing-ui";

export function ListingModalInfo({ listing }: { listing: MarketplaceListingDetail }) {
  const totalWeight = listingTotalWeight(listing);
  const forms = listingForms(listing);
  const productFacts = listingProductFacts(listing);

  return (
    <div className="mp-modal-facts">
      <h2 className="mp-modal-title">{compactPositionsTitle(listing.positions)}</h2>
      <div className="mp-modal-fact-columns">
        <dl className="mp-fact-stack">
          <div>
            <Scale size={15} aria-hidden="true" />
            <dt>В наличии сырья</dt>
            <dd>{formatWeight(totalWeight)}</dd>
          </div>
          <div>
            <Truck size={15} aria-hidden="true" />
            <dt>Готовность к отгрузке</dt>
            <dd>{listing.readyNow ? "Готово сейчас" : formatDateTime(listing.readinessDate).split(",")[0]}</dd>
          </div>
          <div>
            <Package size={15} aria-hidden="true" />
            <dt>Форма поставки</dt>
            <dd>{forms || "—"}</dd>
          </div>
          {listing.packaging ? (
            <div>
              <Layers size={15} aria-hidden="true" />
              <dt>Упаковка</dt>
              <dd>{listing.packaging}</dd>
            </div>
          ) : null}
          <div>
            <CalendarDays size={15} aria-hidden="true" />
            <dt>Размещено</dt>
            <dd>{formatDateTime(listing.publishedAt)}</dd>
          </div>
        </dl>
        {productFacts.length > 0 ? (
          <dl className="mp-modal-spec-grid">
            {productFacts.map((item) => (
              <div key={item.label}>
                <item.icon size={15} aria-hidden="true" />
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <div className="mp-modal-about-inline">
        <h3>О товаре</h3>
        {listing.description ? <p>{listing.description}</p> : <p className="mp-hint">Описание не указано.</p>}
      </div>
    </div>
  );
}

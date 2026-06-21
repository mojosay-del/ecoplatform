"use client";

import { Handshake, Mail, MapPin, Star, UserRound } from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { pluralizeRu } from "../../lib/ru-plural";
import { expiryLabel, isExpiringSoon, memberSinceLabel } from "./listing-card-meta";
import { ListingStatusBadge, formatLocation } from "./listing-ui";

export function ListingModalHeader({ listing }: { listing: MarketplaceListingDetail }) {
  return (
    <div className="mp-modal-header">
      <div className="mp-modal-seller">
        <span className={`mp-modal-avatar${listing.seller.avatarUrl ? " has-image" : ""}`}>
          {listing.seller.avatarUrl ? (
            <img src={listing.seller.avatarUrl} alt="" />
          ) : (
            <UserRound size={22} aria-hidden="true" />
          )}
        </span>
        <div>
          <div className="mp-modal-seller-name">{listing.seller.name}</div>
          <div className="mp-modal-seller-meta">
            <span>
              <MapPin size={13} aria-hidden="true" /> {formatLocation(listing.city, listing.region)}
            </span>
            {listing.seller.rating != null ? (
              <span className="mp-modal-rating">
                <Star size={13} aria-hidden="true" /> {listing.seller.rating.toFixed(1)}
              </span>
            ) : null}
            {/* Блок доверия: сделки и стаж на площадке (фаза 8 API). */}
            {listing.seller.dealsCompleted > 0 ? (
              <span className="mp-modal-deals">
                <Handshake size={13} aria-hidden="true" /> {listing.seller.dealsCompleted}{" "}
                {pluralizeRu(listing.seller.dealsCompleted, "сделка", "сделки", "сделок")}
              </span>
            ) : null}
            {memberSinceLabel(listing.seller.memberSince) ? (
              <span className="mp-modal-member-since">На площадке {memberSinceLabel(listing.seller.memberSince)}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mp-modal-header-badges">
        {/* Главная механика площадки названа прямо в шапке. */}
        <span className="mp-auction-badge">
          <Mail aria-hidden="true" size={13} />
          Закрытый аукцион
        </span>
        {isExpiringSoon(listing.expiresAt) ? (
          <span className="mp-expiry-badge">{expiryLabel(listing.expiresAt)}</span>
        ) : null}
        <ListingStatusBadge status={listing.status} />
      </div>
    </div>
  );
}

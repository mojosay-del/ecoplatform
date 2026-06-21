"use client";

import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { preferredFileAssetImageUrl, type FileAsset } from "../../lib/api";
import type { InfiniteApiState } from "../../lib/use-infinite-api-query";
import { ListingCard, ListingCardSkeleton } from "./listing-ui";

type MarketplaceFeedListProps = {
  listings: MarketplaceListingListItem[];
  assets: Map<string, FileAsset>;
  distanceById: Map<string, number> | null;
  state: InfiniteApiState;
  total: number;
  loadedCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  hasActiveFilters: boolean;
  hoveredId: string | null;
  sentinelRef: (node: HTMLDivElement | null) => void;
  onOpenListing: (id: string) => void;
  onHoverListing: (id: string | null) => void;
  onResetFilters: () => void;
};

export function MarketplaceFeedList({
  listings,
  assets,
  distanceById,
  state,
  total,
  loadedCount,
  hasMore,
  isLoadingMore,
  hasActiveFilters,
  hoveredId,
  sentinelRef,
  onOpenListing,
  onHoverListing,
  onResetFilters,
}: MarketplaceFeedListProps) {
  if (state === "idle" || state === "loading") {
    return (
      <div aria-busy="true" className="mp-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <ListingCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="mp-empty">
        <strong>По заданным фильтрам объявлений нет.</strong>
        <p>Попробуйте смягчить условия — или загляните позже, объявления появляются каждый день.</p>
        {hasActiveFilters ? (
          <button className="button secondary" type="button" onClick={onResetFilters}>
            Сбросить фильтры
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mp-grid">
        {listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            coverUrl={listing.coverFileId ? preferredFileAssetImageUrl(assets.get(listing.coverFileId)) : null}
            distanceKm={distanceById?.get(listing.id) ?? null}
            highlighted={hoveredId === listing.id}
            onOpen={onOpenListing}
            onHover={onHoverListing}
          />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
      <p className="page-subtitle u-text-center u-mt-18">
        Показано {loadedCount} из {total}
      </p>
      {isLoadingMore ? <p className="page-subtitle u-text-center">Загружаем ещё…</p> : null}
      {!hasMore ? <p className="page-subtitle u-text-center">Это все объявления.</p> : null}
    </>
  );
}

"use client";

// Торговая площадка — публичная лента активных объявлений о продаже вторсырья.
// Заготовителям показываем кнопки «Мои объявления» и «Разместить объявление».

import Link from "next/link";
import type { MarketplaceListingListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { ListingCard } from "./listing-ui";

export function MarketplaceView() {
  const { user } = useAuth();
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery("marketplace-listings", () => api.marketplace.listings({ limit: 50 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<MarketplaceListingListItem>);

  const listings = page.items;
  const coverIds = listings.map((listing) => listing.coverFileId).filter((id): id is string => Boolean(id));
  const assets = useFileAssetsByIds(coverIds);
  const isCollector = user?.company?.type === "collector";
  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";

  if (state === "unauthenticated") {
    return <AuthRequired title="Торговая площадка" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Торговая площадка" />;
  }
  if (state === "error") {
    return <ErrorState title="Торговая площадка" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <div className="mp-toolbar">
          <PageHeader title="Торговая площадка" subtitle="Объявления о продаже вторсырья от заготовителей." />
          {isCollector ? (
            <div className="mp-toolbar-actions">
              <Link className="button secondary" href="/marketplace/my">
                Мои объявления
              </Link>
              <Link className="button" href="/marketplace/new">
                Разместить объявление
              </Link>
            </div>
          ) : isBuyer ? (
            <div className="mp-toolbar-actions">
              <Link className="button secondary" href="/marketplace/offers">
                Мои предложения
              </Link>
            </div>
          ) : null}
        </div>

        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка объявлений…
          </p>
        ) : listings.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Пока нет активных объявлений.
          </p>
        ) : (
          <div className="mp-grid">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                coverUrl={listing.coverFileId ? preferredFileAssetImageUrl(assets.get(listing.coverFileId)) : null}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

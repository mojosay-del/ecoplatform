"use client";

// Кабинет заготовителя «Мои объявления»: черновики, активные и архивные с
// быстрыми действиями (опубликовать / снять / переподать / редактировать).

import Link from "next/link";
import { useState } from "react";
import type { MyMarketplaceListingItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { ApiError, api, preferredFileAssetImageUrl } from "../../lib/api";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import {
  ListingStatusBadge,
  archiveReasonLabel,
  formatWeight,
  positionsSummaryText,
  totalWeightKg,
} from "./listing-ui";

export function MyListingsView() {
  const [refresh, setRefresh] = useState(0);
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery(`my-listings-${refresh}`, () => api.marketplace.myListings({ limit: 100 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<MyMarketplaceListingItem>);

  const listings = page.items;
  const coverIds = listings.map((listing) => listing.coverFileId).filter((id): id is string => Boolean(id));
  const assets = useFileAssetsByIds(coverIds);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (state === "unauthenticated") {
    return <AuthRequired title="Мои объявления" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Мои объявления" />;
  }
  if (state === "error") {
    return <ErrorState title="Мои объявления" message={errorMessage} />;
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setRefresh((value) => value + 1);
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "Не удалось выполнить действие.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <div className="mp-toolbar">
          <PageHeader title="Мои объявления" subtitle="Черновики, активные и архивные объявления вашей компании." />
          <div className="mp-toolbar-actions">
            <Link className="button secondary" href="/marketplace">
              К ленте
            </Link>
            <Link className="button" href="/marketplace/new">
              Разместить объявление
            </Link>
          </div>
        </div>

        {error ? <p className="mp-error">{error}</p> : null}

        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка…
          </p>
        ) : listings.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            У вас пока нет объявлений. <Link href="/marketplace/new">Разместить первое</Link>.
          </p>
        ) : (
          <div className="mp-mylist">
            {listings.map((listing) => {
              const cover = listing.coverFileId ? preferredFileAssetImageUrl(assets.get(listing.coverFileId)) : null;
              const busy = busyId === listing.id;
              const archiveLabel = listing.status === "archived" ? archiveReasonLabel(listing.archiveReason) : null;
              return (
                <div className="mp-row" key={listing.id}>
                  {cover ? <img className="mp-row-cover" src={cover} alt="" /> : <div className="mp-row-cover" />}
                  <div className="mp-row-main">
                    <Link className="mp-row-title" href={`/marketplace/${listing.id}`}>
                      {positionsSummaryText(listing.positions)}
                    </Link>
                    <span className="mp-row-sub">
                      {listing.city} · {formatWeight(totalWeightKg(listing.positions))} · {listing.photoCount} фото
                    </span>
                  </div>
                  <div className="mp-row-actions">
                    <div className="mp-row-status">
                      <ListingStatusBadge status={listing.status} />
                      {archiveLabel ? <span className="mp-archive-reason">{archiveLabel}</span> : null}
                    </div>
                    {listing.status !== "archived" ? (
                      <Link className="button secondary" href={`/marketplace/${listing.id}/edit`}>
                        Изменить
                      </Link>
                    ) : null}
                    {listing.status === "draft" ? (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => act(listing.id, () => api.marketplace.publish(listing.id))}
                        type="button"
                      >
                        Опубликовать
                      </button>
                    ) : null}
                    {listing.status !== "archived" ? (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => act(listing.id, () => api.marketplace.archive(listing.id))}
                        type="button"
                      >
                        Снять
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => act(listing.id, () => api.marketplace.republish(listing.id))}
                        type="button"
                      >
                        Переподать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

"use client";

// Торговая площадка — публичная лента активных объявлений: карта с кругами 4 км,
// фильтры по сырью и региону, сортировка по дате/расстоянию (haversine от адреса
// компании до отображаемого центра). Заготовителям и покупателям — свои кнопки.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketplaceListingListItem, PaginatedResponse } from "@ecoplatform/shared";
import { haversineKm } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { ListingCard, useNomenclatureOptions } from "./listing-ui";
import { YandexMap } from "./YandexMap";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function MarketplaceView() {
  const { user } = useAuth();
  const isCollector = user?.company?.type === "collector";
  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";

  const nomenclature = useNomenclatureOptions();
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedNomenclature, setSelectedNomenclature] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "distance">("date");
  const [companyPoint, setCompanyPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    api.marketplace
      .regions()
      .then(setRegions)
      .catch(() => setRegions([]));
    // Координаты компании для сортировки по расстоянию (если адрес геокодирован).
    api.billing
      .status()
      .then((status) => {
        const address = status.factualAddress;
        if (address?.latitude && address?.longitude) {
          setCompanyPoint({ lat: Number(address.latitude), lon: Number(address.longitude) });
        }
      })
      .catch(() => undefined);
  }, []);

  const filterKey = `${selectedRegions.join(",")}|${selectedNomenclature.join(",")}`;
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery(
    `marketplace-listings-${filterKey}`,
    () => api.marketplace.listings({ region: selectedRegions, nomenclatureId: selectedNomenclature, limit: 200 }),
    { items: [], total: 0, hasMore: false } as PaginatedResponse<MarketplaceListingListItem>,
  );

  const listings = useMemo(() => {
    const items = [...page.items];
    if (sortBy === "distance" && companyPoint) {
      const distance = (listing: MarketplaceListingListItem) =>
        listing.circleLat == null || listing.circleLon == null
          ? Number.POSITIVE_INFINITY
          : haversineKm(companyPoint, { lat: listing.circleLat, lon: listing.circleLon });
      items.sort((a, b) => distance(a) - distance(b));
    }
    return items;
  }, [page.items, sortBy, companyPoint]);

  const coverIds = listings.map((listing) => listing.coverFileId).filter((id): id is string => Boolean(id));
  const assets = useFileAssetsByIds(coverIds);

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

        <div className="mp-filters">
          <details className="mp-filter">
            <summary>Сырьё{selectedNomenclature.length ? ` · ${selectedNomenclature.length}` : ""}</summary>
            <div className="mp-filter-options">
              {nomenclature.length === 0 ? <span className="mp-hint">Нет данных</span> : null}
              {nomenclature.map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={selectedNomenclature.includes(option.id)}
                    onChange={() => setSelectedNomenclature((prev) => toggle(prev, option.id))}
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </details>

          <details className="mp-filter">
            <summary>Регион{selectedRegions.length ? ` · ${selectedRegions.length}` : ""}</summary>
            <div className="mp-filter-options">
              {regions.length === 0 ? <span className="mp-hint">Нет данных</span> : null}
              {regions.map((region) => (
                <label key={region}>
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(region)}
                    onChange={() => setSelectedRegions((prev) => toggle(prev, region))}
                  />
                  {region}
                </label>
              ))}
            </div>
          </details>

          {selectedRegions.length || selectedNomenclature.length ? (
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setSelectedRegions([]);
                setSelectedNomenclature([]);
              }}
            >
              Сбросить
            </button>
          ) : null}

          <div className="mp-sort">
            <button className={sortBy === "date" ? "active" : ""} type="button" onClick={() => setSortBy("date")}>
              Сначала новые
            </button>
            {companyPoint ? (
              <button
                className={sortBy === "distance" ? "active" : ""}
                type="button"
                onClick={() => setSortBy("distance")}
              >
                Ближе ко мне
              </button>
            ) : null}
          </div>
        </div>

        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка объявлений…
          </p>
        ) : listings.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            По заданным фильтрам объявлений нет.
          </p>
        ) : (
          <>
            <YandexMap listings={listings} />
            <div className="mp-grid" style={{ marginTop: 18 }}>
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  coverUrl={listing.coverFileId ? preferredFileAssetImageUrl(assets.get(listing.coverFileId)) : null}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

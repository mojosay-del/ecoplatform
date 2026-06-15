"use client";

// Торговая площадка — публичная лента активных объявлений: карта с кругами 4 км,
// фильтры по сырью и региону, сортировка по дате/расстоянию (haversine от адреса
// компании до отображаемого центра). Заготовителям и покупателям — свои кнопки.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader } from "../shared";
import { useNomenclatureOptions } from "./listing-ui";
import { ListingModal } from "./ListingModal";
import { MATERIAL_LEGEND } from "./materials";
import { ListingMap } from "./ListingMap";
import {
  type CompanyPoint,
  type FilterPopover,
  type SortMode,
  DEFAULT_SORT_OPTION,
  MARKETPLACE_FEED_PAGE_SIZE,
  availableSortOptions,
  distanceByListingId,
  formatBbox,
  groupNomenclatureOptions,
  sortMarketplaceListings,
} from "./marketplace-feed";
import { MarketplaceFeedList } from "./marketplace-feed-list";
import { MarketplaceActiveFilters, MarketplaceFilterBar, useMarketplaceFilterDismiss } from "./marketplace-filters";

export function MarketplaceView() {
  const { ready, token, user } = useAuth();
  const isCollector = user?.company?.type === "collector";
  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";

  const nomenclature = useNomenclatureOptions();
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedNomenclature, setSelectedNomenclature] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortMode>("date");
  const [openPopover, setOpenPopover] = useState<FilterPopover | null>(null);
  const [companyPoint, setCompanyPoint] = useState<CompanyPoint | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hover-синхронизация ленты и карты (id объявления под курсором).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // «Искать в этой области»: применённый bbox (уходит в API) и границы после
  // последнего ручного перемещения карты (ждут нажатия кнопки).
  const [mapBbox, setMapBbox] = useState<string | null>(null);
  const [pendingBbox, setPendingBbox] = useState<string | null>(null);
  // Узкие экраны: сплит сворачивается, активна либо лента, либо карта.
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const filtersRef = useRef<HTMLDivElement>(null);

  useMarketplaceFilterDismiss(filtersRef, setOpenPopover);

  useEffect(() => {
    if (!ready || !token) return;
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
  }, [ready, token]);

  useEffect(() => {
    if (sortBy === "distance" && !companyPoint) {
      setSortBy("date");
    }
  }, [companyPoint, sortBy]);

  const filterKey = `${selectedRegions.join(",")}|${selectedNomenclature.join(",")}|${mapBbox ?? ""}`;
  const { items, total, hasMore, state, errorMessage, isLoadingMore, reload, sentinelRef } = useInfiniteApiQuery(
    ready && token ? `marketplace-listings-${filterKey}` : null,
    MARKETPLACE_FEED_PAGE_SIZE,
    ({ limit, offset }) =>
      api.marketplace.listings({
        region: selectedRegions,
        nomenclatureId: selectedNomenclature,
        bbox: mapBbox ?? undefined,
        limit,
        offset,
      }),
  );

  const distanceById = useMemo(() => distanceByListingId(items, companyPoint), [items, companyPoint]);
  const listings = useMemo(() => sortMarketplaceListings(items, sortBy, distanceById), [items, sortBy, distanceById]);

  const sortOptions = useMemo(() => availableSortOptions(companyPoint), [companyPoint]);
  const selectedSort = sortOptions.find((option) => option.value === sortBy) ?? DEFAULT_SORT_OPTION;
  const hasActiveFilters = selectedRegions.length > 0 || selectedNomenclature.length > 0 || mapBbox !== null;

  const nomenclatureGroups = useMemo(() => groupNomenclatureOptions(nomenclature), [nomenclature]);

  function resetFilters() {
    setSelectedRegions([]);
    setSelectedNomenclature([]);
    setMapBbox(null);
  }

  const coverIds = listings.map((listing) => listing.coverFileId).filter((id): id is string => Boolean(id));
  const assets = useFileAssetsByIds(coverIds);

  if (ready && !token) {
    return <AuthRequired title="Торговая площадка" />;
  }
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
      <section className="page mp-page-wide">
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

        {/* На узких экранах сплит сворачивается в один столбец — переключатель
            Список/Карта (карта при этом не размонтируется, только скрывается). */}
        <div className="mp-view-toggle" role="group" aria-label="Вид ленты">
          <button
            aria-pressed={mobileView === "list"}
            className={mobileView === "list" ? "is-active" : ""}
            type="button"
            onClick={() => setMobileView("list")}
          >
            Список
          </button>
          <button
            aria-pressed={mobileView === "map"}
            className={mobileView === "map" ? "is-active" : ""}
            type="button"
            onClick={() => setMobileView("map")}
          >
            Карта
          </button>
        </div>

        <div className="mp-split">
          <div className={`mp-split-list${mobileView === "map" ? " is-mobile-hidden" : ""}`}>
            <MarketplaceFilterBar
              containerRef={filtersRef}
              nomenclatureGroups={nomenclatureGroups}
              selectedNomenclature={selectedNomenclature}
              setSelectedNomenclature={setSelectedNomenclature}
              regions={regions}
              selectedRegions={selectedRegions}
              setSelectedRegions={setSelectedRegions}
              sortBy={sortBy}
              setSortBy={setSortBy}
              openPopover={openPopover}
              setOpenPopover={setOpenPopover}
              sortOptions={sortOptions}
              selectedSort={selectedSort}
            />
            {hasActiveFilters ? (
              <MarketplaceActiveFilters
                nomenclatureGroups={nomenclatureGroups}
                selectedNomenclature={selectedNomenclature}
                setSelectedNomenclature={setSelectedNomenclature}
                selectedRegions={selectedRegions}
                setSelectedRegions={setSelectedRegions}
                mapBbox={mapBbox}
                onClearMapBbox={() => setMapBbox(null)}
                onResetFilters={resetFilters}
              />
            ) : null}
            <MarketplaceFeedList
              listings={listings}
              assets={assets}
              distanceById={distanceById}
              state={state}
              total={total}
              loadedCount={items.length}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              hasActiveFilters={hasActiveFilters}
              hoveredId={hoveredId}
              sentinelRef={sentinelRef}
              onOpenListing={setSelectedId}
              onHoverListing={setHoveredId}
              onResetFilters={resetFilters}
            />
          </div>

          {/* Карта живёт всегда (и при загрузке, и при пустой выдаче) — нет
              layout-прыжков, а пустое состояние сохраняет географический контекст. */}
          <aside className={`mp-split-map${mobileView === "map" ? " is-mobile-visible" : ""}`}>
            <div className="mp-map-shell">
              <ListingMap
                fitOnDataChange={!mapBbox}
                hoveredId={hoveredId}
                listings={listings}
                onHover={setHoveredId}
                onSelect={setSelectedId}
                onUserMoved={(bounds) => setPendingBbox(formatBbox(bounds))}
              />
              {/* Кнопка появляется после ручного перемещения карты и применяет
                  видимую область как серверный фильтр ленты. */}
              {pendingBbox && pendingBbox !== mapBbox ? (
                <button className="mp-map-search-area" type="button" onClick={() => setMapBbox(pendingBbox)}>
                  Искать в этой области
                </button>
              ) : null}
              {/* Легенда цветов сырья — обычный DOM-оверлей поверх карты. */}
              <div className="mp-map-legend">
                {MATERIAL_LEGEND.map((item) => (
                  <span key={item.slug}>
                    <i aria-hidden="true" className="mp-material-dot" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {selectedId ? (
          <ListingModal listingId={selectedId} onClose={() => setSelectedId(null)} onChanged={reload} />
        ) : null}
      </section>
    </AppShell>
  );
}

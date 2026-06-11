"use client";

// Торговая площадка — публичная лента активных объявлений: карта с кругами 4 км,
// фильтры по сырью и региону, сортировка по дате/расстоянию (haversine от адреса
// компании до отображаемого центра). Заготовителям и покупателям — свои кнопки.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { haversineKm } from "@ecoplatform/shared";
import { Check, ChevronDown } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader } from "../shared";
import { ListingCard, totalWeightKg, useNomenclatureOptions } from "./listing-ui";
import { ListingModal } from "./ListingModal";
import { YandexMap } from "./YandexMap";

type SortMode = "date" | "distance" | "weight" | "expires";
type FilterPopover = "nomenclature" | "region" | "sort";

type SortOption = {
  value: SortMode;
  label: string;
  description: string;
  requiresCompanyPoint?: boolean;
};

const DEFAULT_SORT_OPTION: SortOption = {
  value: "date",
  label: "Сначала новые",
  description: "Свежие объявления выше остальных.",
};

const SORT_OPTIONS: SortOption[] = [
  DEFAULT_SORT_OPTION,
  {
    value: "distance",
    label: "Ближе ко мне",
    description: "Сначала партии рядом с вашей компанией.",
    requiresCompanyPoint: true,
  },
  { value: "weight", label: "Больше объём", description: "Крупные партии показываются первыми." },
  { value: "expires", label: "Скоро истекают", description: "Объявления с ближайшим окончанием выше." },
];

const MARKETPLACE_FEED_PAGE_SIZE = 40;

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function dateValue(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

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
  const [companyPoint, setCompanyPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

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
    function closeOnOutsideClick(event: PointerEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPopover(null);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (sortBy === "distance" && !companyPoint) {
      setSortBy("date");
    }
  }, [companyPoint, sortBy]);

  const filterKey = `${selectedRegions.join(",")}|${selectedNomenclature.join(",")}`;
  const {
    items,
    total,
    hasMore,
    state,
    errorMessage,
    isLoadingMore,
    reload,
    sentinelRef,
  } = useInfiniteApiQuery(
    ready && token ? `marketplace-listings-${filterKey}` : null,
    MARKETPLACE_FEED_PAGE_SIZE,
    ({ limit, offset }) =>
      api.marketplace.listings({ region: selectedRegions, nomenclatureId: selectedNomenclature, limit, offset }),
  );

  const listings = useMemo(() => {
    const sortedItems = [...items];
    const newestFirst = (a: MarketplaceListingListItem, b: MarketplaceListingListItem) =>
      dateValue(b.publishedAt, 0) - dateValue(a.publishedAt, 0);
    const distance = (listing: MarketplaceListingListItem) =>
      listing.circleLat == null || listing.circleLon == null || !companyPoint
        ? Number.POSITIVE_INFINITY
        : haversineKm(companyPoint, { lat: listing.circleLat, lon: listing.circleLon });

    if (sortBy === "distance") {
      sortedItems.sort((a, b) => distance(a) - distance(b) || newestFirst(a, b));
    } else if (sortBy === "weight") {
      sortedItems.sort((a, b) => totalWeightKg(b.positions) - totalWeightKg(a.positions) || newestFirst(a, b));
    } else if (sortBy === "expires") {
      sortedItems.sort(
        (a, b) =>
          dateValue(a.expiresAt, Number.POSITIVE_INFINITY) - dateValue(b.expiresAt, Number.POSITIVE_INFINITY) ||
          newestFirst(a, b),
      );
    } else {
      sortedItems.sort(newestFirst);
    }
    return sortedItems;
  }, [items, sortBy, companyPoint]);

  const sortOptions = useMemo(
    () => SORT_OPTIONS.filter((option) => !option.requiresCompanyPoint || companyPoint),
    [companyPoint],
  );
  const selectedSort = sortOptions.find((option) => option.value === sortBy) ?? DEFAULT_SORT_OPTION;
  const hasActiveFilters = selectedRegions.length > 0 || selectedNomenclature.length > 0;

  const coverIds = listings.map((listing) => listing.coverFileId).filter((id): id is string => Boolean(id));
  const assets = useFileAssetsByIds(coverIds);
  const filterBar = (
    <div className="mp-filterbar" ref={filtersRef}>
      <div className="mp-filterbar-group">
        <div className={`mp-filter-popover${openPopover === "nomenclature" ? " is-open" : ""}`}>
          <button
            aria-controls="marketplace-nomenclature-popover"
            aria-expanded={openPopover === "nomenclature"}
            className="mp-filter-trigger"
            type="button"
            onClick={() => setOpenPopover((value) => (value === "nomenclature" ? null : "nomenclature"))}
          >
            <span>Сырьё{selectedNomenclature.length ? ` · ${selectedNomenclature.length}` : ""}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          {openPopover === "nomenclature" ? (
            <div className="mp-filter-menu" id="marketplace-nomenclature-popover">
              {nomenclature.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
              {nomenclature.map((option) => (
                <label className="mp-filter-option" key={option.id}>
                  <input
                    type="checkbox"
                    checked={selectedNomenclature.includes(option.id)}
                    onChange={() => setSelectedNomenclature((prev) => toggle(prev, option.id))}
                  />
                  <span>{option.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className={`mp-filter-popover${openPopover === "region" ? " is-open" : ""}`}>
          <button
            aria-controls="marketplace-region-popover"
            aria-expanded={openPopover === "region"}
            className="mp-filter-trigger"
            type="button"
            onClick={() => setOpenPopover((value) => (value === "region" ? null : "region"))}
          >
            <span>Регион{selectedRegions.length ? ` · ${selectedRegions.length}` : ""}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          {openPopover === "region" ? (
            <div className="mp-filter-menu" id="marketplace-region-popover">
              {regions.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
              {regions.map((region) => (
                <label className="mp-filter-option" key={region}>
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(region)}
                    onChange={() => setSelectedRegions((prev) => toggle(prev, region))}
                  />
                  <span>{region}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {hasActiveFilters ? (
          <button
            className="mp-filter-reset"
            type="button"
            onClick={() => {
              setSelectedRegions([]);
              setSelectedNomenclature([]);
            }}
          >
            Сбросить
          </button>
        ) : null}
      </div>

      <div className={`mp-filter-popover mp-filter-popover-sort${openPopover === "sort" ? " is-open" : ""}`}>
        <button
          aria-controls="marketplace-sort-popover"
          aria-expanded={openPopover === "sort"}
          className="mp-filter-trigger"
          type="button"
          onClick={() => setOpenPopover((value) => (value === "sort" ? null : "sort"))}
        >
          <span>{selectedSort.label}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        {openPopover === "sort" ? (
          <div className="mp-filter-menu mp-sort-menu" id="marketplace-sort-popover">
            {sortOptions.map((option) => (
              <button
                className={`mp-sort-option${sortBy === option.value ? " is-active" : ""}`}
                key={option.value}
                type="button"
                onClick={() => {
                  setSortBy(option.value);
                  setOpenPopover(null);
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {sortBy === option.value ? <Check aria-hidden="true" size={16} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

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

        {state === "idle" || state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка объявлений…
          </p>
        ) : listings.length === 0 ? (
          <>
            {filterBar}
            <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
              По заданным фильтрам объявлений нет.
            </p>
          </>
        ) : (
          <>
            <YandexMap listings={listings} onSelect={setSelectedId} />
            {filterBar}
            <div className="mp-grid" style={{ marginTop: 18 }}>
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  coverUrl={listing.coverFileId ? preferredFileAssetImageUrl(assets.get(listing.coverFileId)) : null}
                  onOpen={setSelectedId}
                />
              ))}
            </div>
            <div ref={sentinelRef} aria-hidden="true" />
            <p className="page-subtitle" style={{ textAlign: "center", marginTop: 18 }}>
              Показано {items.length} из {total}
            </p>
            {isLoadingMore ? (
              <p className="page-subtitle" style={{ textAlign: "center" }}>
                Загружаем ещё…
              </p>
            ) : null}
            {!hasMore ? (
              <p className="page-subtitle" style={{ textAlign: "center" }}>
                Это все объявления.
              </p>
            ) : null}
          </>
        )}

        {selectedId ? (
          <ListingModal
            listingId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={reload}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

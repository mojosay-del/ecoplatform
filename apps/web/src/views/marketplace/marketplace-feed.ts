import type { MarketplaceListingListItem, MarketplaceNomenclatureOption } from "@ecoplatform/shared";
import { haversineKm } from "@ecoplatform/shared";
import type { MapViewBounds } from "./ListingMap";
import { totalWeightKg } from "./listing-ui";

export type SortMode = "date" | "distance" | "weight" | "expires";
export type FilterPopover = "category" | "nomenclature" | "region" | "sort";
export type CompanyPoint = { lat: number; lon: number };

// Категория сырья со своими номенклатурами — чип фильтра + группа в «Сырьё».
export type NomenclatureGroup = {
  slug: string;
  name: string;
  options: MarketplaceNomenclatureOption[];
};

export type SortOption = {
  value: SortMode;
  label: string;
  description: string;
  requiresCompanyPoint?: boolean;
};

export const DEFAULT_SORT_OPTION: SortOption = {
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

export const MARKETPLACE_FEED_PAGE_SIZE = 40;

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function dateValue(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

// Границы карты → bbox-параметр API. 5 знаков ≈ метровая точность.
export function formatBbox(bounds: MapViewBounds): string {
  const fixed = (value: number) => value.toFixed(5);
  return `${fixed(bounds.south)},${fixed(bounds.west)},${fixed(bounds.north)},${fixed(bounds.east)}`;
}

export function groupSelectionState(group: NomenclatureGroup, selected: string[]): "none" | "partial" | "all" {
  const count = group.options.filter((option) => selected.includes(option.id)).length;
  if (count === 0) return "none";
  return count === group.options.length ? "all" : "partial";
}

// Чип категории: «вся выбрана» → снять; «нет/часть» → выбрать целиком.
export function toggleNomenclatureGroup(selected: string[], group: NomenclatureGroup): string[] {
  const ids = group.options.map((option) => option.id);
  const allSelected = ids.every((id) => selected.includes(id));
  if (allSelected) return selected.filter((id) => !ids.includes(id));
  return [...new Set([...selected, ...ids])];
}

// Номенклатура, сгруппированная по категориям (порядок справочника сохранён).
export function groupNomenclatureOptions(nomenclature: MarketplaceNomenclatureOption[]): NomenclatureGroup[] {
  const groups: NomenclatureGroup[] = [];
  const bySlug = new Map<string, NomenclatureGroup>();
  for (const option of nomenclature) {
    let group = bySlug.get(option.categorySlug);
    if (!group) {
      group = { slug: option.categorySlug, name: option.category, options: [] };
      bySlug.set(option.categorySlug, group);
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}

// Расстояния от адреса компании до отображаемых центров кругов — для сортировки
// «Ближе ко мне» и подписи «≈ N км» на карточках.
export function distanceByListingId(
  listings: MarketplaceListingListItem[],
  companyPoint: CompanyPoint | null,
): Map<string, number> | null {
  if (!companyPoint) return null;
  const map = new Map<string, number>();
  for (const listing of listings) {
    if (listing.circleLat != null && listing.circleLon != null) {
      map.set(listing.id, haversineKm(companyPoint, { lat: listing.circleLat, lon: listing.circleLon }));
    }
  }
  return map;
}

export function sortMarketplaceListings(
  listings: MarketplaceListingListItem[],
  sortBy: SortMode,
  distanceById: Map<string, number> | null,
): MarketplaceListingListItem[] {
  const sortedItems = [...listings];
  const newestFirst = (a: MarketplaceListingListItem, b: MarketplaceListingListItem) =>
    dateValue(b.publishedAt, 0) - dateValue(a.publishedAt, 0);
  const distance = (listing: MarketplaceListingListItem) => distanceById?.get(listing.id) ?? Number.POSITIVE_INFINITY;

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
}

export function availableSortOptions(companyPoint: CompanyPoint | null): SortOption[] {
  return SORT_OPTIONS.filter((option) => !option.requiresCompanyPoint || companyPoint);
}

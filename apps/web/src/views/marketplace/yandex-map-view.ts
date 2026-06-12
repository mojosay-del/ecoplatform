import type { MarketplaceListingListItem } from "@ecoplatform/shared";

export type ListingMapPoint = Pick<MarketplaceListingListItem, "circleLat" | "circleLon">;
export type ListingMapMode = "dot" | "circle";

export const LISTING_MAP_DEFAULT_CENTER: [number, number] = [55.76, 37.64];
export const LISTING_MAP_DEFAULT_ZOOM = 5;
export const LISTING_MAP_CIRCLE_ZOOM_THRESHOLD = 9;
export const LISTING_MAP_CLUSTER_MIN_POINTS = 8;

export function getSinglePointFocusView(points: ListingMapPoint[]): { center: [number, number]; zoom: number } | null {
  if (points.length !== 1) return null;

  const [point] = points;
  if (!point || point.circleLat == null || point.circleLon == null) return null;

  return {
    center: [point.circleLat, point.circleLon],
    zoom: LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  };
}

export function shouldClusterMapPoints(mode: ListingMapMode, pointCount: number): boolean {
  return mode === "dot" && pointCount >= LISTING_MAP_CLUSTER_MIN_POINTS;
}

export const LISTING_MAP_DOT_SIZE = 14;
export const LISTING_MAP_DOT_HIGHLIGHT_SIZE = 20;

// Опции стиля круга 4 км: подсветка при hover карточки в ленте — плотнее
// заливка и толще обводка, объект НЕ пересоздаётся (options.set).
export function circleStyleOptions(color: string, highlighted: boolean): Record<string, unknown> {
  return {
    fillColor: `${color}${highlighted ? "55" : "2e"}`,
    strokeColor: color,
    strokeWidth: highlighted ? 3 : 2,
  };
}

// Опции иконки точки дальнего масштаба; href готовит yandex-loader (data URI).
export function dotIconOptions(iconHref: string, highlighted: boolean): Record<string, unknown> {
  const size = highlighted ? LISTING_MAP_DOT_HIGHLIGHT_SIZE : LISTING_MAP_DOT_SIZE;
  return {
    iconLayout: "default#image",
    iconImageHref: iconHref,
    iconImageSize: [size, size],
    iconImageOffset: [-size / 2, -size / 2],
  };
}

export const LISTING_MAP_PULSE_SIZE = 28;

// Опции пульсирующей точки свежего объявления — крупнее обычной, чтобы
// расширяющееся кольцо не обрезалось рамкой иконки.
export function pulseDotIconOptions(iconHref: string): Record<string, unknown> {
  return {
    iconLayout: "default#image",
    iconImageHref: iconHref,
    iconImageSize: [LISTING_MAP_PULSE_SIZE, LISTING_MAP_PULSE_SIZE],
    iconImageOffset: [-LISTING_MAP_PULSE_SIZE / 2, -LISTING_MAP_PULSE_SIZE / 2],
  };
}

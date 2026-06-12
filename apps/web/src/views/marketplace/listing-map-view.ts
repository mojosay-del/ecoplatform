import type { MarketplaceListingListItem } from "@ecoplatform/shared";

export type ListingMapPoint = Pick<MarketplaceListingListItem, "circleLat" | "circleLon">;
export type ListingMapMode = "dot" | "circle";

// Центр по умолчанию — Москва. ВАЖНО: MapGL ждёт [lon, lat] (GeoJSON), поэтому
// долгота идёт первой (у Яндекса было наоборот).
export const LISTING_MAP_DEFAULT_CENTER: [number, number] = [37.64, 55.76];
export const LISTING_MAP_DEFAULT_ZOOM = 5;
export const LISTING_MAP_CIRCLE_ZOOM_THRESHOLD = 9;

// Начиная с городского масштаба показываем круг 4 км; дальше — маленькая точка,
// чтобы не загромождать карту.
export function modeForZoom(zoom: number): ListingMapMode {
  return zoom >= LISTING_MAP_CIRCLE_ZOOM_THRESHOLD ? "circle" : "dot";
}

// Единственная точка — центрируемся на ней в городском масштабе (как и у круга).
// Возвращает центр в порядке MapGL [lon, lat].
export function getSinglePointFocusView(points: ListingMapPoint[]): { center: [number, number]; zoom: number } | null {
  if (points.length !== 1) return null;

  const [point] = points;
  if (!point || point.circleLat == null || point.circleLon == null) return null;

  return {
    center: [point.circleLon, point.circleLat],
    zoom: LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  };
}

// Опции стиля круга 4 км под MapGL: цвет заливки — #rrggbbaa (альфа в конце),
// при подсветке hover карточки в ленте заливка плотнее и обводка толще.
export function circleStyleOptions(
  color: string,
  highlighted: boolean,
): { color: string; strokeColor: string; strokeWidth: number } {
  return {
    color: `${color}${highlighted ? "55" : "2e"}`,
    strokeColor: color,
    strokeWidth: highlighted ? 3 : 2,
  };
}

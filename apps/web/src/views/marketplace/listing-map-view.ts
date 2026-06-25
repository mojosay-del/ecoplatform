import type { MarketplaceListingListItem } from "@ecoplatform/shared";

export type ListingMapPoint = Pick<MarketplaceListingListItem, "circleLat" | "circleLon">;
export type ListingMapMode = "dot" | "circle";
export type ListingMapFeatureLike = {
  id?: number | string | null;
  properties?: { id?: unknown } | null;
} | null;

// Центр по умолчанию — Москва. ВАЖНО: MapLibre ждёт [lon, lat] (GeoJSON), поэтому
// долгота идёт первой.
export const LISTING_MAP_DEFAULT_CENTER: [number, number] = [37.64, 55.76];
export const LISTING_MAP_DEFAULT_ZOOM = 5;
export const LISTING_MAP_MIN_ZOOM = LISTING_MAP_DEFAULT_ZOOM;
export const LISTING_MAP_CIRCLE_ZOOM_THRESHOLD = 9;

// Начиная с городского масштаба показываем круг 4 км; дальше — маленькая точка,
// чтобы не загромождать карту. В MapLibre переключение делает сам движок через
// minzoom/maxzoom слоёв, но порог держим здесь единым источником.
export function modeForZoom(zoom: number): ListingMapMode {
  return zoom >= LISTING_MAP_CIRCLE_ZOOM_THRESHOLD ? "circle" : "dot";
}

// Единственная точка — центрируемся на ней в городском масштабе (как и у круга).
// Возвращает центр в порядке MapLibre [lon, lat].
export function getSinglePointFocusView(points: ListingMapPoint[]): { center: [number, number]; zoom: number } | null {
  if (points.length !== 1) return null;

  const [point] = points;
  if (!point || point.circleLat == null || point.circleLon == null) return null;

  return {
    center: [point.circleLon, point.circleLat],
    zoom: LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  };
}

export function listingIdFromMapFeature(feature: ListingMapFeatureLike | undefined): string | null {
  const propertyId = feature?.properties?.id;
  if (typeof propertyId === "string" && propertyId.length > 0) return propertyId;
  if (typeof propertyId === "number" && Number.isFinite(propertyId)) return String(propertyId);

  const featureId = feature?.id;
  if (typeof featureId === "string" && featureId.length > 0) return featureId;
  if (typeof featureId === "number" && Number.isFinite(featureId)) return String(featureId);
  return null;
}

const EARTH_RADIUS_KM = 6371;

// Кольцо круга заданного радиуса (км) вокруг центра [lon, lat] как координаты
// полигона GeoJSON (один замкнутый ring: первая точка совпадает с последней).
// MapLibre не имеет географического круга-примитива (circle-radius в пикселях),
// поэтому 4-км круг объявления рисуем полигоном через fill/line-слои.
export function circlePolygon(center: [number, number], radiusKm: number, steps = 64): number[][][] {
  const [lon, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * 2 * Math.PI;
    const dLat = ((radiusKm / EARTH_RADIUS_KM) * 180) / Math.PI;
    const dLon = dLat / Math.cos(latRad);
    ring.push([lon + dLon * Math.sin(theta), lat + dLat * Math.cos(theta)]);
  }
  return [ring];
}

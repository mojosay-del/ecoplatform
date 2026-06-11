import type { MarketplaceListingListItem } from "@ecoplatform/shared";

export type ListingMapPoint = Pick<MarketplaceListingListItem, "circleLat" | "circleLon">;

export const LISTING_MAP_DEFAULT_CENTER: [number, number] = [55.76, 37.64];
export const LISTING_MAP_DEFAULT_ZOOM = 5;
export const LISTING_MAP_CIRCLE_ZOOM_THRESHOLD = 9;

export function getSinglePointFocusView(points: ListingMapPoint[]): { center: [number, number]; zoom: number } | null {
  if (points.length !== 1) return null;

  const [point] = points;
  if (!point || point.circleLat == null || point.circleLon == null) return null;

  return {
    center: [point.circleLat, point.circleLon],
    zoom: LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  };
}

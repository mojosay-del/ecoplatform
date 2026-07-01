// Геология площадки: радиус круга-скрытия и формула haversine для сортировки по
// расстоянию (клиентская, от адреса компании до отображаемого центра круга).
// Алгоритмы провайдеро-независимы — см. docs/08-architecture/geo-logic.md.

export const MARKETPLACE_CIRCLE_RADIUS_KM = 0.5;

export type GeoPoint = { lat: number; lon: number };

// Расстояние по дуге большого круга (км) на сферической модели Земли.
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

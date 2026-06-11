import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";

// Отображаемый центр круга 4 км: случайное смещение от реальной точки,
// равномерное по ПЛОЩАДИ круга (d = R·√u — иначе точки скашивались бы к центру и
// ослабляли скрытие). Генерируется один раз при сохранении координат адреса и
// далее стабилен (docs/08-architecture/geo-logic.md, раздел 7).
export function generateCircleCenter(lat: number, lon: number): { lat: number; lon: number } {
  const radiusKm = MARKETPLACE_CIRCLE_RADIUS_KM;
  const angle = Math.random() * 2 * Math.PI;
  const distanceKm = radiusKm * Math.sqrt(Math.random());
  const deltaLat = (distanceKm * Math.cos(angle)) / 111.32;
  const deltaLon = (distanceKm * Math.sin(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + deltaLat, lon: lon + deltaLon };
}

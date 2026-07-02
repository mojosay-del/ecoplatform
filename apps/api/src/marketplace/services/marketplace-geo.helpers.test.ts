import { describe, expect, it } from "vitest";
import { MARKETPLACE_CIRCLE_RADIUS_KM, haversineKm } from "@ecoplatform/shared";
import { generateCircleCenter } from "./marketplace-geo.helpers";

describe("marketplace geo", () => {
  it("отображаемый центр всегда в пределах 4 км от реальной точки", () => {
    const lat = 55.751244;
    const lon = 37.618423; // Москва
    for (let i = 0; i < 2000; i += 1) {
      const center = generateCircleCenter(lat, lon);
      const distance = haversineKm({ lat, lon }, { lat: center.lat, lon: center.lon });
      expect(distance).toBeLessThanOrEqual(MARKETPLACE_CIRCLE_RADIUS_KM + 0.1);
    }
  });

  it("смещение покрывает заметную долю радиуса (не вырождено в ноль)", () => {
    const lat = 55.751244;
    const lon = 37.618423;
    const distances = Array.from({ length: 500 }, () => {
      const center = generateCircleCenter(lat, lon);
      return haversineKm({ lat, lon }, { lat: center.lat, lon: center.lon });
    });
    // Смещение не вырождается в ноль: за 500 сэмплов максимум покрывает заметную
    // долю радиуса. Порог привязан к самому радиусу (а не к «4 км»), чтобы тест
    // переживал изменение MARKETPLACE_CIRCLE_RADIUS_KM (сейчас 500 м).
    expect(Math.max(...distances)).toBeGreaterThan(MARKETPLACE_CIRCLE_RADIUS_KM * 0.5);
  });

  it("haversine соответствует известному расстоянию (Москва–СПб ≈ 633 км)", () => {
    const distance = haversineKm({ lat: 55.7558, lon: 37.6173 }, { lat: 59.9343, lon: 30.3351 });
    expect(distance).toBeGreaterThan(600);
    expect(distance).toBeLessThan(660);
  });
});

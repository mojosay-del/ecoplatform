import { describe, expect, it } from "vitest";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  circlePolygon,
  getSinglePointFocusView,
  modeForZoom,
} from "./listing-map-view";

describe("marketplace listing map view", () => {
  it("focuses a single listing at the circle zoom in MapLibre [lon, lat] order", () => {
    expect(getSinglePointFocusView([{ circleLat: 56.12, circleLon: 37.45 }])).toEqual({
      center: [37.45, 56.12],
      zoom: LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
    });
  });

  it("keeps bounds fitting for multiple listings", () => {
    expect(
      getSinglePointFocusView([
        { circleLat: 56.12, circleLon: 37.45 },
        { circleLat: 57.21, circleLon: 39.88 },
      ]),
    ).toBeNull();
  });

  it("does not focus listings without coordinates", () => {
    expect(getSinglePointFocusView([{ circleLat: null, circleLon: 37.45 }])).toBeNull();
    expect(getSinglePointFocusView([{ circleLat: 56.12, circleLon: null }])).toBeNull();
  });

  it("switches to circle mode at the zoom threshold, dots below", () => {
    expect(modeForZoom(LISTING_MAP_CIRCLE_ZOOM_THRESHOLD)).toBe("circle");
    expect(modeForZoom(LISTING_MAP_CIRCLE_ZOOM_THRESHOLD - 1)).toBe("dot");
  });

  it("circlePolygon — замкнутое кольцо нужного радиуса вокруг центра", () => {
    const center: [number, number] = [37.6, 55.75];
    const ring = circlePolygon(center, 4, 32)[0] as number[][];

    // steps + 1 точек, кольцо замкнуто (первая === последняя).
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[ring.length - 1]);

    // Каждая точка примерно в 4 км от центра (грубая проверка по равноугольной
    // метрике: ~111 км на градус широты).
    for (const point of ring) {
      const [lon, lat] = point as [number, number];
      const dLatKm = (lat - center[1]) * 111;
      const dLonKm = (lon - center[0]) * 111 * Math.cos((center[1] * Math.PI) / 180);
      const distance = Math.hypot(dLatKm, dLonKm);
      expect(distance).toBeGreaterThan(3.8);
      expect(distance).toBeLessThan(4.2);
    }
  });
});

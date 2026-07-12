import { describe, expect, it } from "vitest";
import { domRectToTourRect, inflateTourRect, isRectComfortablyInViewport, tourRectsAlmostEqual } from "./tour-geometry";

describe("tour-geometry", () => {
  it("inflateTourRect расширяет вырез равномерно и не даёт отрицательных размеров", () => {
    expect(inflateTourRect({ x: 100, y: 50, width: 200, height: 40 }, 8)).toEqual({
      x: 92,
      y: 42,
      width: 216,
      height: 56,
    });
    expect(inflateTourRect({ x: 10, y: 10, width: 4, height: 4 }, -10).width).toBe(0);
  });

  it("tourRectsAlmostEqual фильтрует субпиксельный шум, но видит реальные сдвиги", () => {
    const base = { x: 10, y: 20, width: 100, height: 50 };
    expect(tourRectsAlmostEqual(base, { ...base, x: 10.3 })).toBe(true);
    expect(tourRectsAlmostEqual(base, { ...base, x: 11 })).toBe(false);
    expect(tourRectsAlmostEqual(null, base)).toBe(false);
    expect(tourRectsAlmostEqual(null, null)).toBe(true);
  });

  it("domRectToTourRect копирует только координаты", () => {
    expect(domRectToTourRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  describe("isRectComfortablyInViewport", () => {
    const vw = 1280;
    const vh = 800;

    it("цель целиком в кадре ниже шапки — прокрут не нужен", () => {
      expect(isRectComfortablyInViewport({ x: 200, y: 200, width: 400, height: 120 }, vw, vh)).toBe(true);
    });

    it("цель под липким топбаром или за нижним краем — нужен прокрут", () => {
      expect(isRectComfortablyInViewport({ x: 200, y: 20, width: 400, height: 120 }, vw, vh)).toBe(false);
      expect(isRectComfortablyInViewport({ x: 200, y: 750, width: 400, height: 120 }, vw, vh)).toBe(false);
    });

    it("цель выше вьюпорта (сайдбар) считается видимой при любом пересечении", () => {
      expect(isRectComfortablyInViewport({ x: 0, y: 0, width: 240, height: 900 }, vw, vh)).toBe(true);
      expect(isRectComfortablyInViewport({ x: 0, y: 900, width: 240, height: 900 }, vw, vh)).toBe(false);
    });
  });
});

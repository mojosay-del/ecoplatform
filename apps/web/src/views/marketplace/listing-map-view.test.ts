import { describe, expect, it } from "vitest";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  circleStyleOptions,
  getSinglePointFocusView,
  modeForZoom,
} from "./listing-map-view";

describe("marketplace listing map view", () => {
  it("focuses a single listing at the circle zoom in MapGL [lon, lat] order", () => {
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

  it("подсветка круга — плотнее заливка и толще обводка, цвет сохраняется", () => {
    expect(circleStyleOptions("#1f6fb8", false)).toEqual({
      color: "#1f6fb82e",
      strokeColor: "#1f6fb8",
      strokeWidth: 2,
    });
    expect(circleStyleOptions("#1f6fb8", true)).toEqual({
      color: "#1f6fb855",
      strokeColor: "#1f6fb8",
      strokeWidth: 3,
    });
  });
});

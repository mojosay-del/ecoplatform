import { describe, expect, it } from "vitest";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_CLUSTER_MIN_POINTS,
  getSinglePointFocusView,
  shouldClusterMapPoints,
} from "./yandex-map-view";

describe("marketplace Yandex map view", () => {
  it("focuses a single listing at the circle zoom", () => {
    expect(getSinglePointFocusView([{ circleLat: 56.12, circleLon: 37.45 }])).toEqual({
      center: [56.12, 37.45],
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

  it("clusters only dense dot mode maps", () => {
    expect(shouldClusterMapPoints("dot", LISTING_MAP_CLUSTER_MIN_POINTS)).toBe(true);
    expect(shouldClusterMapPoints("dot", LISTING_MAP_CLUSTER_MIN_POINTS - 1)).toBe(false);
    expect(shouldClusterMapPoints("circle", LISTING_MAP_CLUSTER_MIN_POINTS)).toBe(false);
  });
});

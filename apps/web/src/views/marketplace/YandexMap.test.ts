import { describe, expect, it } from "vitest";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_CLUSTER_MIN_POINTS,
  LISTING_MAP_DOT_HIGHLIGHT_SIZE,
  LISTING_MAP_DOT_SIZE,
  LISTING_MAP_PULSE_SIZE,
  circleStyleOptions,
  dotIconOptions,
  getSinglePointFocusView,
  pulseDotIconOptions,
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

  it("подсветка круга — плотнее заливка и толще обводка, цвет сохраняется", () => {
    expect(circleStyleOptions("#1f6fb8", false)).toEqual({
      fillColor: "#1f6fb82e",
      strokeColor: "#1f6fb8",
      strokeWidth: 2,
    });
    expect(circleStyleOptions("#1f6fb8", true)).toEqual({
      fillColor: "#1f6fb855",
      strokeColor: "#1f6fb8",
      strokeWidth: 3,
    });
  });

  it("подсвеченная точка крупнее и центрирована по своему размеру", () => {
    const normal = dotIconOptions("data:normal", false);
    const highlighted = dotIconOptions("data:hl", true);
    expect(normal).toMatchObject({
      iconImageHref: "data:normal",
      iconImageSize: [LISTING_MAP_DOT_SIZE, LISTING_MAP_DOT_SIZE],
      iconImageOffset: [-LISTING_MAP_DOT_SIZE / 2, -LISTING_MAP_DOT_SIZE / 2],
    });
    expect(highlighted).toMatchObject({
      iconImageHref: "data:hl",
      iconImageSize: [LISTING_MAP_DOT_HIGHLIGHT_SIZE, LISTING_MAP_DOT_HIGHLIGHT_SIZE],
      iconImageOffset: [-LISTING_MAP_DOT_HIGHLIGHT_SIZE / 2, -LISTING_MAP_DOT_HIGHLIGHT_SIZE / 2],
    });
  });

  it("пульс-иконка свежего объявления крупнее и центрирована", () => {
    expect(pulseDotIconOptions("data:pulse")).toMatchObject({
      iconImageHref: "data:pulse",
      iconImageSize: [LISTING_MAP_PULSE_SIZE, LISTING_MAP_PULSE_SIZE],
      iconImageOffset: [-LISTING_MAP_PULSE_SIZE / 2, -LISTING_MAP_PULSE_SIZE / 2],
    });
  });
});

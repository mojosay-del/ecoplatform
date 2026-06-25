import { describe, expect, it } from "vitest";
import { RF_AND_BELARUS_LABEL_ZONE, shouldConstrainLabelLayerToPlatformZone } from "./listing-map-label-zones";

type LonLat = [number, number];
type Ring = LonLat[];
type PolygonCoordinates = Ring[];

function pointInRing(point: LonLat, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const [xCurrent, yCurrent] = currentPoint;
    const [xPrevious, yPrevious] = previousPoint;
    const intersects =
      yCurrent > y !== yPrevious > y &&
      x < ((xPrevious - xCurrent) * (y - yCurrent)) / (yPrevious - yCurrent) + xCurrent;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LonLat, polygon: PolygonCoordinates): boolean {
  const [outerRing, ...holes] = polygon;
  return Boolean(outerRing && pointInRing(point, outerRing) && holes.every((hole) => !pointInRing(point, hole)));
}

function pointInMultiPolygon(point: LonLat): boolean {
  return RF_AND_BELARUS_LABEL_ZONE.coordinates.some((polygon) => pointInPolygon(point, polygon as PolygonCoordinates));
}

function auxiliaryLabelAllowed(point: LonLat): boolean {
  return pointInMultiPolygon(point);
}

describe("marketplace map label zones", () => {
  it("does not constrain settlement labels to the platform zone", () => {
    expect(shouldConstrainLabelLayerToPlatformZone("place")).toBe(false);
    expect(shouldConstrainLabelLayerToPlatformZone("transportation_name")).toBe(true);
  });

  it("keeps southern auxiliary labels inside the visible label zone", () => {
    expect(auxiliaryLabelAllowed([39.7015, 47.2357])).toBe(true);
    expect(auxiliaryLabelAllowed([38.9753, 45.0355])).toBe(true);
    expect(auxiliaryLabelAllowed([39.7231, 43.5855])).toBe(true);
  });

  it("does not hide Lithuania settlement labels anymore", () => {
    expect(shouldConstrainLabelLayerToPlatformZone("place")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  isVideoMime,
  parseVideoRenditions,
  planRenditionHeights,
  scaledWidth,
  serializeVideoRenditions,
} from "./video-renditions";

describe("video-renditions helpers", () => {
  it("isVideoMime распознаёт только video/*", () => {
    expect(isVideoMime("video/mp4")).toBe(true);
    expect(isVideoMime("video/quicktime")).toBe(true);
    expect(isVideoMime("audio/mpeg")).toBe(false);
    expect(isVideoMime(null)).toBe(false);
  });

  it("planRenditionHeights не апскейлит и всегда даёт хотя бы один ренишен", () => {
    expect(planRenditionHeights(1080)).toEqual([1080, 720, 480]);
    expect(planRenditionHeights(900)).toEqual([720, 480]);
    expect(planRenditionHeights(720)).toEqual([720, 480]);
    expect(planRenditionHeights(500)).toEqual([480]);
    expect(planRenditionHeights(360)).toEqual([360]);
    expect(planRenditionHeights(361)).toEqual([360]); // округляем до чётной
    expect(planRenditionHeights(0)).toEqual([720]); // неизвестная высота
  });

  it("scaledWidth сохраняет пропорции и округляет до чётного", () => {
    expect(scaledWidth(1920, 1080, 720)).toBe(1280);
    expect(scaledWidth(1080, 1920, 480)).toBe(270); // вертикальное видео
  });

  it("serialize → parse round-trip", () => {
    const data = {
      status: "ready" as const,
      renditions: [{ height: 720, width: 1280, storageKey: "k/720.mp4", sizeBytes: 1000 }],
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    const parsed = parseVideoRenditions(serializeVideoRenditions(data) as never);
    expect(parsed).toEqual(data);
  });

  it("parseVideoRenditions отбрасывает мусор и битый статус", () => {
    expect(parseVideoRenditions(null)).toBeNull();
    expect(parseVideoRenditions({ status: "weird", renditions: [] } as never)).toBeNull();
    const partial = parseVideoRenditions({
      status: "ready",
      renditions: [{ height: 720 }, { height: 480, width: 854, storageKey: "k.mp4", sizeBytes: 5 }],
    } as never);
    expect(partial?.renditions).toHaveLength(1);
  });
});

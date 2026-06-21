import { ContentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { publishedLifecycleData } from "./publish-lifecycle.helpers";

describe("publishedLifecycleData (L-8)", () => {
  it("первая публикация фиксирует firstPublishedAt = now", () => {
    const now = new Date("2026-06-21T10:00:00.000Z");
    expect(publishedLifecycleData({ firstPublishedAt: null }, now)).toEqual({
      status: ContentStatus.published,
      firstPublishedAt: now,
    });
  });

  it("повторная публикация сохраняет исходную дату первой публикации", () => {
    const firstPublishedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-06-21T10:00:00.000Z");
    expect(publishedLifecycleData({ firstPublishedAt }, now)).toEqual({
      status: ContentStatus.published,
      firstPublishedAt,
    });
  });
});

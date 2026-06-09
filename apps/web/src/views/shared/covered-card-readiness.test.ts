import { describe, expect, it } from "vitest";
import { shouldRenderCoveredCardSkeleton } from "./covered-card-readiness";

describe("shouldRenderCoveredCardSkeleton", () => {
  it("does not block cards without a cover", () => {
    expect(shouldRenderCoveredCardSkeleton({ coverImageId: null, coverUrl: null, settledCoverUrl: null })).toBe(false);
  });

  it("keeps a covered card in skeleton state until the asset URL is known", () => {
    expect(shouldRenderCoveredCardSkeleton({ coverImageId: "cover-1", coverUrl: null, settledCoverUrl: null })).toBe(
      true,
    );
  });

  it("keeps a covered card in skeleton state until the current image settles", () => {
    expect(
      shouldRenderCoveredCardSkeleton({
        coverImageId: "cover-1",
        coverUrl: "https://cdn.example/cover.avif",
        settledCoverUrl: null,
      }),
    ).toBe(true);
  });

  it("reveals the card only for the loaded current cover URL", () => {
    expect(
      shouldRenderCoveredCardSkeleton({
        coverImageId: "cover-1",
        coverUrl: "https://cdn.example/cover.avif",
        settledCoverUrl: "https://cdn.example/cover.avif",
      }),
    ).toBe(false);

    expect(
      shouldRenderCoveredCardSkeleton({
        coverImageId: "cover-1",
        coverUrl: "https://cdn.example/new-cover.avif",
        settledCoverUrl: "https://cdn.example/old-cover.avif",
      }),
    ).toBe(true);
  });
});

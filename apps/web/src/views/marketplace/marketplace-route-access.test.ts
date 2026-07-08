import { describe, expect, it } from "vitest";
import { shouldRedirectFromMarketplace } from "./marketplace-route-access";

describe("marketplace route access", () => {
  it("redirects marketplace routes only when the feature is explicitly disabled", () => {
    expect(
      shouldRedirectFromMarketplace({ features: { marketplace: false, analyticsMap: false, participantMap: false } }),
    ).toBe(true);
    expect(
      shouldRedirectFromMarketplace({ features: { marketplace: true, analyticsMap: false, participantMap: false } }),
    ).toBe(false);
    expect(shouldRedirectFromMarketplace(null)).toBe(false);
  });
});

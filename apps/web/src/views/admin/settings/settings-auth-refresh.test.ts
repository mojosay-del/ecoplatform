import { describe, expect, it } from "vitest";
import { hasStaleAuthFeaturesAfterSettingsLoad, shouldRefreshAuthAfterSettingChange } from "./settings-auth-refresh";

describe("settings auth refresh", () => {
  it("refreshes the current user after changing feature-backed settings", () => {
    expect(shouldRefreshAuthAfterSettingChange("marketplace.enabled")).toBe(true);
  });

  it("does not refresh the current user for unrelated settings", () => {
    expect(shouldRefreshAuthAfterSettingChange("support.new_tickets_enabled")).toBe(false);
    expect(shouldRefreshAuthAfterSettingChange("moderation.lock_duration_minutes")).toBe(false);
  });

  it("detects when loaded settings differ from current user features", () => {
    expect(
      hasStaleAuthFeaturesAfterSettingsLoad([{ key: "marketplace.enabled", value: true }], { marketplace: false }),
    ).toBe(true);
    expect(
      hasStaleAuthFeaturesAfterSettingsLoad([{ key: "marketplace.enabled", value: false }], { marketplace: false }),
    ).toBe(false);
  });

  it("ignores non-feature settings and missing feature snapshots", () => {
    expect(
      hasStaleAuthFeaturesAfterSettingsLoad([{ key: "support.new_tickets_enabled", value: true }], {
        marketplace: false,
      }),
    ).toBe(false);
    expect(hasStaleAuthFeaturesAfterSettingsLoad([{ key: "marketplace.enabled", value: true }], null)).toBe(false);
  });
});

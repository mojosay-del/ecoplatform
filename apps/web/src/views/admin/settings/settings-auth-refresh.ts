type AuthFeatureKey = "marketplace" | "analyticsMap" | "participantMap";

const SETTING_AUTH_FEATURES = {
  "marketplace.enabled": "marketplace",
  "maps.analytics_enabled": "analyticsMap",
  "maps.participant_enabled": "participantMap",
} as const satisfies Record<string, AuthFeatureKey>;

export function shouldRefreshAuthAfterSettingChange(key: string): boolean {
  return key in SETTING_AUTH_FEATURES;
}

export function hasStaleAuthFeaturesAfterSettingsLoad(
  items: readonly { key: string; value: unknown }[],
  features: Partial<Record<AuthFeatureKey, boolean>> | null | undefined,
): boolean {
  if (!features) return false;

  return items.some((item) => {
    const feature = SETTING_AUTH_FEATURES[item.key as keyof typeof SETTING_AUTH_FEATURES];
    return Boolean(feature && typeof item.value === "boolean" && features[feature] !== item.value);
  });
}

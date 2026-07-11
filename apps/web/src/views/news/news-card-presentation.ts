import type { NewsAccessTier } from "@ecoplatform/shared";

export function newsCardLabels(accessTier: NewsAccessTier) {
  return {
    category: "Новости",
    tier: accessTier === "extended" ? "Расширенная" : null,
  } as const;
}

export function newsCardTagState(selectedTags: readonly string[], tag: string) {
  const isActive = selectedTags.includes(tag);
  return { isActive, showRemoveIcon: isActive } as const;
}

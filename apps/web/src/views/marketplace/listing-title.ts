import type { MarketplaceListingPositionSummary } from "@ecoplatform/shared";

export function compactPositionsTitle(positions: MarketplaceListingPositionSummary[]): string {
  const names = positions.map((position) => position.nomenclatureName);
  if (names.length === 0) return "Объявление";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2}`;
}

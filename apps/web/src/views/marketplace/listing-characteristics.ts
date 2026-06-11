import type { MarketplaceListingDetail } from "@ecoplatform/shared";

type ListingPositionDetail = MarketplaceListingDetail["positions"][number];

export const MOISTURE_CONDITION_LABEL = {
  dry: "Сухое",
  slightly_wet: "Немного влажное",
  wet: "Влажное",
} as const;

export const CONTAMINATION_CONDITION_LABEL = {
  clean: "Без включений",
  may_have_inclusions: "Могут быть иные включения",
  has_inclusions: "Есть иные включения",
} as const;

export function moistureLabel(position: Pick<ListingPositionDetail, "moistureCondition"> | undefined): string | null {
  return position?.moistureCondition ? MOISTURE_CONDITION_LABEL[position.moistureCondition] : null;
}

export function contaminationLabel(
  position: Pick<ListingPositionDetail, "contaminationCondition"> | undefined,
): string | null {
  return position?.contaminationCondition ? CONTAMINATION_CONDITION_LABEL[position.contaminationCondition] : null;
}

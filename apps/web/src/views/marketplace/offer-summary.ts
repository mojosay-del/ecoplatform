export type OfferSummaryPosition = {
  id: string;
  nomenclatureName: string;
  weightKg: number;
};

export type OfferSummaryLine = {
  id: string;
  nomenclatureName: string;
  weightKg: number;
  pricePerTonRub: number | null;
  totalRub: number | null;
};

export type OfferSummary = {
  totalCount: number;
  selectedCount: number;
  totalRub: number;
  lines: OfferSummaryLine[];
};

export function formatPricePerTonInput(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? Number(digits).toLocaleString("ru-RU") : "";
}

export function parsePricePerTon(value: string): number | null {
  const digits = value.replace(/\s/g, "");
  if (!digits || !/^\d+$/.test(digits)) return null;
  const price = Number(digits);
  return price > 0 ? price : null;
}

export function buildOfferSummary(
  positions: OfferSummaryPosition[],
  pricesByPositionId: Record<string, string>,
): OfferSummary {
  const lines = positions.map((position) => {
    const pricePerTonRub = parsePricePerTon(pricesByPositionId[position.id] ?? "");
    const totalRub = pricePerTonRub == null ? null : Math.round((position.weightKg / 1000) * pricePerTonRub);
    return {
      id: position.id,
      nomenclatureName: position.nomenclatureName,
      weightKg: position.weightKg,
      pricePerTonRub,
      totalRub,
    };
  });

  return {
    totalCount: positions.length,
    selectedCount: lines.filter((line) => line.pricePerTonRub != null).length,
    totalRub: lines.reduce((sum, line) => sum + (line.totalRub ?? 0), 0),
    lines,
  };
}

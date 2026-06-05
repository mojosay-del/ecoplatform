import { MONTH_LABELS } from "./constants";
import type { IndexPeriod } from "./types";

export function formatIndexPrice(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

export function formatIndexDateLabel(date: Date, period: IndexPeriod) {
  const month = MONTH_LABELS[date.getMonth()];
  return ["1Y", "2Y", "3Y"].includes(period)
    ? `${month} ${date.getFullYear()}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

export function formatIndexTooltipDate(date: Date) {
  const month = MONTH_LABELS[date.getMonth()];
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

export function buildSmoothChartPath(xs: number[], ys: number[]) {
  if (xs.length === 0) return "";
  if (xs.length === 1) return `M${xs[0]!.toFixed(1)},${ys[0]!.toFixed(1)}`;

  const h = xs.slice(0, -1).map((x, i) => xs[i + 1]! - x);
  const slopes = h.map((distance, i) => (ys[i + 1]! - ys[i]!) / distance);
  const tangents = ys.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0;
    if (i === ys.length - 1) return slopes[slopes.length - 1] ?? 0;

    const previousSlope = slopes[i - 1] ?? 0;
    const nextSlope = slopes[i] ?? 0;
    if (previousSlope * nextSlope <= 0) return 0;

    const previousDistance = h[i - 1] ?? 0;
    const nextDistance = h[i] ?? 0;
    const weightA = 2 * nextDistance + previousDistance;
    const weightB = nextDistance + 2 * previousDistance;
    return (weightA + weightB) / (weightA / previousSlope + weightB / nextSlope);
  });

  const commands = [`M${xs[0]!.toFixed(1)},${ys[0]!.toFixed(1)}`];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i]!;
    const y1 = ys[i]!;
    const x2 = xs[i + 1]!;
    const y2 = ys[i + 1]!;
    const distance = x2 - x1;

    const cp1x = x1 + distance / 3;
    const cp1y = y1 + ((tangents[i] ?? 0) * distance) / 3;
    const cp2x = x2 - distance / 3;
    const cp2y = y2 - ((tangents[i + 1] ?? 0) * distance) / 3;

    commands.push(
      `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
    );
  }

  return commands.join(" ");
}

export function smoothPricesForScale(prices: number[], period: IndexPeriod, innerWidth: number) {
  if (prices.length < 5 || period === "2W" || period === "1M") return prices;

  const pointGap = innerWidth / Math.max(1, prices.length - 1);
  const isLongPeriod = period === "1Y" || period === "2Y" || period === "3Y";
  const targetGap = isLongPeriod ? 28 : 14;
  const maxRadius = isLongPeriod ? 18 : 6;
  const radius = Math.min(
    maxRadius,
    Math.max(1, Math.round(targetGap / Math.max(1, pointGap))),
    Math.max(1, Math.floor(prices.length / 8)),
  );

  if (radius <= 0) return prices;

  return prices.map((price, index) => {
    if (index === 0 || index === prices.length - 1) return price;

    let weightedSum = 0;
    let weightTotal = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sourceIndex = index + offset;
      if (sourceIndex < 0 || sourceIndex >= prices.length) continue;

      const weight = radius + 1 - Math.abs(offset);
      weightedSum += prices[sourceIndex]! * weight;
      weightTotal += weight;
    }

    return weightedSum / weightTotal;
  });
}

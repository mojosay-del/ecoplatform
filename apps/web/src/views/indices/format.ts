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

export function buildSmoothChartPath(rawXs: number[], rawYs: number[]) {
  // Оставляем только точки со строго возрастающим X и конечными координатами.
  // На сводном графике X — это время, и две записи за одну дату давали два
  // одинаковых X. Тогда шаг h=0 → наклон становится Infinity/NaN → контрольные
  // точки кривой NaN → браузер молча отбрасывает весь <path>. Внешне это
  // выглядело как «рваные» кривые или просто точки вместо линий. Совпавшие по X
  // точки схлопываем (усредняем Y), чтобы линия оставалась непрерывной.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < rawXs.length; i += 1) {
    const x = rawXs[i]!;
    const y = rawYs[i]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const lastX = xs[xs.length - 1];
    if (lastX === undefined || x > lastX + 1e-6) {
      xs.push(x);
      ys.push(y);
    } else {
      ys[ys.length - 1] = (ys[ys.length - 1]! + y) / 2;
    }
  }

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

// «Красивые» отметки для оси Y: ровные значения (1/2/5 × 10ⁿ) внутри диапазона
// цен, чтобы подписи и горизонтальная сетка читались, а не были рваными числами.
export function niceAxisTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const span = max - min;
  if (span <= 0) return [min];

  const rawStep = span / Math.max(1, count);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceStep = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let value = start; value <= max + niceStep * 0.001; value += niceStep) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

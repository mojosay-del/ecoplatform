"use client";

// Крошечный спарклайн: переиспользует monotone-cubic путь из format.ts и красит
// линию по net-направлению (рост = зелёный, снижение = красный). Декоративный —
// числа рядом несут данные, поэтому aria-hidden. Используется в «пульсе рынка» и
// в списке движения индексов.

import { buildSmoothChartPath } from "./format";
import { netDirection, TREND_COLOR, type TrendDirection } from "./trend";
import type { IndexPoint } from "./types";

export function IndexSparkline({
  points,
  width = 96,
  height = 32,
  direction,
}: {
  points: IndexPoint[];
  width?: number;
  height?: number;
  direction?: TrendDirection;
}) {
  const prices = points.map((point) => Number(point.price)).filter((price) => Number.isFinite(price));

  if (prices.length === 0) {
    return <span className="index-sparkline index-sparkline-empty" style={{ width, height }} aria-hidden="true" />;
  }

  const dir = direction ?? netDirection(points);
  const color = TREND_COLOR[dir];
  const pad = 3;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;

  const xs = prices.map((_, index) =>
    prices.length === 1 ? pad + innerWidth / 2 : pad + (index / (prices.length - 1)) * innerWidth,
  );
  const ys = prices.map((price) => pad + innerHeight - ((price - min) / range) * innerHeight);
  const line = buildSmoothChartPath(xs, ys);
  const lastX = xs[xs.length - 1]!;
  const lastY = ys[ys.length - 1]!;

  return (
    <svg
      className="index-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.3" fill={color} />
    </svg>
  );
}

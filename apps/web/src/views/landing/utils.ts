import type { CSSProperties } from "react";

export function sparkline(values: number[], w = 128, h = 40) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - ((v - min) / range) * (h - 8)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

export const reveal = (delay: number): CSSProperties => ({ "--reveal-delay": `${delay}ms` }) as CSSProperties;

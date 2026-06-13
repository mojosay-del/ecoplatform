"use client";

// Чип тренда «Рост / Снижение / Без изменений» и стрелка направления. Иконки —
// inline-SVG (в проекте нет icon-шрифта), цвет наследуется от чипа через
// currentColor. Цвет=смысл: зелёный/красный/нейтраль (см. trend.ts).

import { TREND_LABEL, type TrendDirection } from "./trend";

export function TrendArrow({ direction }: { direction: TrendDirection }) {
  if (direction === "flat") {
    return (
      <svg className="index-trend-arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  const up = direction === "up";
  return (
    <svg className="index-trend-arrow" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={up ? "M5 1.6 L8.8 8 L1.2 8 Z" : "M5 8.4 L8.8 2 L1.2 2 Z"} fill="currentColor" />
    </svg>
  );
}

export function TrendChip({ direction, className }: { direction: TrendDirection; className?: string }) {
  return (
    <span className={`index-trend-chip ${direction}${className ? ` ${className}` : ""}`}>
      <TrendArrow direction={direction} />
      {TREND_LABEL[direction]}
    </span>
  );
}

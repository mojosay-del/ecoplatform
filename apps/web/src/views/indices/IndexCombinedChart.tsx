"use client";

// Совмещённый график всех номенклатур категории: по одной кривой на номенклатуру
// разными цветами на ОБЩЕЙ шкале реальных цен (₽/т). Помогает увидеть общую
// тенденцию (напр. по макулатуре) в одной плашке. Ось X — по времени (серии могут
// иметь разную частоту точек), Y — общий ценовой домен по всем сериям. При наведении
// показываем название номенклатуры + дату + цену; общей цены справа сверху нет.

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { INDEX_PERIOD_LABELS } from "./constants";
import {
  buildSmoothChartPath,
  formatIndexDateLabel,
  formatIndexPrice,
  formatIndexTooltipDate,
  smoothPricesForScale,
} from "./format";
import type { IndexPeriod } from "./types";

// Различимая палитра; циклится по индексу номенклатуры.
const SERIES_COLORS = [
  "#4d73d8",
  "#f5773e",
  "#1f9d6b",
  "#9b59d0",
  "#e0457b",
  "#14b1c4",
  "#d9a420",
  "#5b6b7a",
  "#d65a4f",
  "#6aa84f",
];

type SeriesPoint = { t: number; price: number };
type ProjectedPoint = { x: number; y: number; t: number; price: number };

export function IndexCombinedChart({
  nomenclatures,
  categoryName,
}: {
  nomenclatures: NomenclatureListItem[];
  categoryName?: string;
}) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const [period, setPeriod] = useState<IndexPeriod>("3M");
  const [hover, setHover] = useState<{ seriesIndex: number; pointIndex: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setHover(null);
  }, [period]);

  // Снимаем подсветку, когда курсор уходит с графика (на случай, если mouseleave
  // не сработал из-за перекрытия тултипом).
  useEffect(() => {
    if (hover === null) return;
    function handleDocumentMouseMove(event: MouseEvent) {
      const svg = svgRef.current;
      const target = event.target;
      if (svg && target instanceof Node && svg.contains(target)) return;
      setHover(null);
    }
    document.addEventListener("mousemove", handleDocumentMouseMove);
    return () => document.removeEventListener("mousemove", handleDocumentMouseMove);
  }, [hover]);

  const series = useMemo(() => {
    return nomenclatures
      .map((item, index) => {
        const raw = item.chart?.[period] ?? [];
        const points: SeriesPoint[] = raw
          .map((point) => ({ t: new Date(point.date).getTime(), price: Number(point.price) }))
          .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price))
          .sort((a, b) => a.t - b.t);
        return {
          id: item.id,
          name: item.name,
          unit: item.unit ?? "₽/т",
          color: SERIES_COLORS[index % SERIES_COLORS.length]!,
          points,
        };
      })
      .filter((entry) => entry.points.length > 0);
  }, [nomenclatures, period]);

  const width = 1080;
  const height = 340;
  const padding = { top: 34, right: 26, bottom: 40, left: 26 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const geometry = useMemo(() => {
    const allPoints = series.flatMap((entry) => entry.points);
    if (allPoints.length === 0) return null;

    const times = allPoints.map((point) => point.t);
    const prices = allPoints.map((point) => point.price);
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tRange = tMax - tMin || 1;
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const range = priceMax - priceMin || priceMax || 1;
    const domainPadding = range * 0.12;
    const domainMin = priceMin - domainPadding;
    const domainMax = priceMax + domainPadding;
    const domainRange = domainMax - domainMin || 1;

    const scaleX = (t: number) =>
      tMax === tMin ? padding.left + innerWidth / 2 : padding.left + ((t - tMin) / tRange) * innerWidth;
    const scaleY = (price: number) => padding.top + innerHeight - ((price - domainMin) / domainRange) * innerHeight;

    const projected = series.map((entry) => {
      const xs = entry.points.map((point) => scaleX(point.t));
      const rawY = entry.points.map((point) => point.price);
      const smoothed = smoothPricesForScale(rawY, period, innerWidth);
      const ys = smoothed.map(scaleY);
      const coords: ProjectedPoint[] = entry.points.map((point, i) => ({
        x: xs[i]!,
        y: ys[i]!,
        t: point.t,
        price: point.price,
      }));
      return { ...entry, coords, path: buildSmoothChartPath(xs, ys) };
    });

    // Метки оси X: равномерно по времени, формат зависит от периода.
    const tickCount = 5;
    const labels: Array<{ x: number; text: string }> = [];
    for (let i = 0; i < tickCount; i += 1) {
      const t = tMin + (tRange * i) / (tickCount - 1);
      const x = scaleX(t);
      const text = formatIndexDateLabel(new Date(t), period);
      const previous = labels[labels.length - 1];
      if (!previous || x - previous.x >= 120) labels.push({ x, text });
    }

    return { projected, labels, tMin, tMax };
  }, [series, period, innerWidth, innerHeight, padding.left, padding.top]);

  function handleMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const svgY = ((event.clientY - rect.top) / rect.height) * height;

    let best: { seriesIndex: number; pointIndex: number; dist: number } | null = null;
    geometry.projected.forEach((entry, seriesIndex) => {
      entry.coords.forEach((point, pointIndex) => {
        const dx = point.x - svgX;
        const dy = point.y - svgY;
        const dist = dx * dx + dy * dy;
        if (!best || dist < best.dist) best = { seriesIndex, pointIndex, dist };
      });
    });

    if (!best) return;
    const chosen = best as { seriesIndex: number; pointIndex: number; dist: number };
    setHover((current) =>
      current && current.seriesIndex === chosen.seriesIndex && current.pointIndex === chosen.pointIndex
        ? current
        : { seriesIndex: chosen.seriesIndex, pointIndex: chosen.pointIndex },
    );
  }

  const active =
    geometry && hover
      ? {
          color: geometry.projected[hover.seriesIndex]?.color,
          name: geometry.projected[hover.seriesIndex]?.name,
          unit: geometry.projected[hover.seriesIndex]?.unit,
          point: geometry.projected[hover.seriesIndex]?.coords[hover.pointIndex],
        }
      : null;

  const tooltip = (() => {
    if (!active?.point || !active.name) return null;
    const dateLine = `${formatIndexTooltipDate(new Date(active.point.t))} · ${formatIndexPrice(active.point.price)} ${active.unit}`;
    const charWidth = 7.1;
    const boxWidth = Math.max(active.name.length, dateLine.length) * charWidth + 24;
    const x = Math.min(Math.max(active.point.x, boxWidth / 2 + 6), width - boxWidth / 2 - 6);
    const y = Math.max(active.point.y - 52, padding.top + 2);
    return { dateLine, boxWidth, x, y };
  })();

  return (
    <section className="index-combined" aria-labelledby={`index-combined-title-${uid}`}>
      <div className="index-combined-head">
        <div className="index-combined-heading">
          <span className="index-combined-eyebrow">Все номенклатуры{categoryName ? ` · ${categoryName}` : ""}</span>
          <h2 id={`index-combined-title-${uid}`}>Сводная динамика</h2>
        </div>
        <div className="index-period-tabs index-combined-periods" aria-label="Период сводного графика">
          {(Object.keys(INDEX_PERIOD_LABELS) as IndexPeriod[]).map((value) => (
            <button
              className={`index-period-tab ${period === value ? "active" : ""}`}
              key={value}
              onClick={() => setPeriod(value)}
              type="button"
            >
              {INDEX_PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {!geometry ? (
        <div className="index-chart-empty">Нет данных для сводного графика за выбранный период</div>
      ) : (
        <>
          <div className="index-combined-chart-wrap">
            <svg
              className="index-combined-chart"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              ref={svgRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHover(null)}
            >
              <rect x="0" y="0" width={width} height={height} fill="transparent" />

              {active?.point ? (
                <line
                  x1={active.point.x}
                  x2={active.point.x}
                  y1={padding.top}
                  y2={padding.top + innerHeight}
                  stroke="#1a202e"
                  strokeDasharray="3 4"
                  strokeOpacity="0.2"
                />
              ) : null}

              {geometry.projected.map((entry, seriesIndex) => {
                const dimmed = hover !== null && hover.seriesIndex !== seriesIndex;
                return (
                  <g key={entry.id} opacity={dimmed ? 0.28 : 1}>
                    <path
                      d={entry.path}
                      fill="none"
                      stroke={entry.color}
                      strokeWidth={hover?.seriesIndex === seriesIndex ? 3.4 : 2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {entry.coords.length === 1 ? (
                      <circle cx={entry.coords[0]!.x} cy={entry.coords[0]!.y} r="4" fill={entry.color} />
                    ) : null}
                  </g>
                );
              })}

              {active?.point ? (
                <circle
                  cx={active.point.x}
                  cy={active.point.y}
                  r="6"
                  fill={active.color}
                  stroke="white"
                  strokeWidth="2.4"
                />
              ) : null}

              {tooltip && active?.name ? (
                <g transform={`translate(${tooltip.x}, ${tooltip.y})`}>
                  <rect x={-tooltip.boxWidth / 2} y="-2" width={tooltip.boxWidth} height="46" rx="12" fill="#1a202e" />
                  <text x="0" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
                    {active.name}
                  </text>
                  <text x="0" y="35" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.82)">
                    {tooltip.dateLine}
                  </text>
                </g>
              ) : null}

              {geometry.labels.map((label, i) => {
                const anchor = i === 0 ? "start" : i === geometry.labels.length - 1 ? "end" : "middle";
                return (
                  <text
                    key={i}
                    x={label.x}
                    y={height - 12}
                    textAnchor={anchor}
                    fontSize="13"
                    fill="var(--muted)"
                  >
                    {label.text}
                  </text>
                );
              })}
            </svg>
          </div>

          <ul className="index-combined-legend">
            {geometry.projected.map((entry, seriesIndex) => (
              <li
                className={`index-combined-legend-item${hover?.seriesIndex === seriesIndex ? " is-active" : ""}`}
                key={entry.id}
              >
                <span className="index-combined-legend-dot" style={{ background: entry.color }} aria-hidden="true" />
                <span className="index-combined-legend-name">{entry.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

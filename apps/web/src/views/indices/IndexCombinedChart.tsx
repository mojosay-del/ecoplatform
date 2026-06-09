"use client";

// Совмещённый график всех номенклатур категории: по одной кривой на номенклатуру
// разными цветами на ОБЩЕЙ шкале реальных цен (₽/т). Помогает увидеть общую
// тенденцию (напр. по макулатуре) в одной плашке. Ось X — по времени (серии могут
// иметь разную частоту точек), Y — общий ценовой домен по всем сериям, с
// горизонтальной сеткой и подписями цен слева. При наведении на график
// показываем название номенклатуры + дату + цену; наведение на легенду
// подсвечивает соответствующую кривую.

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import {
  buildSmoothChartPath,
  formatIndexDateLabel,
  formatIndexPrice,
  formatIndexTooltipDate,
  niceAxisTicks,
  smoothPricesForScale,
} from "./format";
import { IndexPeriodTabs } from "./IndexPeriodTabs";
import type { IndexPeriod } from "./types";

// Различимая палитра; циклится по индексу номенклатуры. Синий и оранжевый
// зарезервированы под направление хвоста линии: рост / снижение.
const SERIES_COLORS = [
  "#7c3aed",
  "#16a34a",
  "#db2777",
  "#52525b",
  "#0f766e",
  "#a21caf",
  "#4d7c0f",
  "#64748b",
  "#be185d",
  "#15803d",
];
const TREND_GROWTH_COLOR = "#4d73d8";
const TREND_FALL_COLOR = "#f5773e";
const TREND_START_RATIO = 0.9;
const TREND_SOLID_START_OFFSET = "92%";
const TREND_BASE_END_OFFSET = "90%";

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

  // Стартовый период подбираем под данные: индексы обновляются редко, поэтому в
  // коротком окне (3 мес.) у половины номенклатур бывает 1 точка — и кривые
  // вырождались в одиночные «точки». Берём самый короткий период, в котором ВСЕ
  // серии рисуются линией (≥2 точек); если такого нет — окно с максимумом
  // линий. Так карточка открывается на нормальных кривых, а не на россыпи точек.
  const defaultPeriod = useMemo<IndexPeriod>(() => {
    const order: IndexPeriod[] = ["3M", "6M", "1Y", "2Y", "3Y"];
    const total = nomenclatures.length;
    let best: IndexPeriod = "1Y";
    let bestScore = -1;
    for (const value of order) {
      const lineable = nomenclatures.filter((item) => (item.chart?.[value]?.length ?? 0) >= 2).length;
      if (total > 0 && lineable === total) return value;
      if (lineable > bestScore) {
        bestScore = lineable;
        best = value;
      }
    }
    return best;
  }, [nomenclatures]);

  const [period, setPeriod] = useState<IndexPeriod>(defaultPeriod);
  const [hover, setHover] = useState<{ seriesIndex: number; pointIndex: number } | null>(null);
  // Подсветка кривой при наведении на её строку в легенде (без тултипа).
  const [legendSeries, setLegendSeries] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Сменили категорию (другой набор номенклатур) → переустанавливаем удачный
  // стартовый период. В пределах одной категории строка defaultPeriod стабильна,
  // поэтому ручной выбор периода пользователем не сбрасывается.
  useEffect(() => {
    setPeriod(defaultPeriod);
  }, [defaultPeriod]);

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
  const height = 360;
  const padding = { top: 28, right: 26, bottom: 40, left: 66 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const baselineY = padding.top + innerHeight;

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

    const trendStartT = tMin + tRange * TREND_START_RATIO;
    const trendStartX = scaleX(trendStartT);

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
      const lastPoint = coords[coords.length - 1];
      const firstTailPoint =
        coords.find((point) => point.t >= trendStartT) ?? (coords.length > 1 ? coords[coords.length - 2] : coords[0]);
      const trendColor =
        lastPoint && firstTailPoint && lastPoint.price >= firstTailPoint.price ? TREND_GROWTH_COLOR : TREND_FALL_COLOR;
      return { ...entry, coords, path: buildSmoothChartPath(xs, ys), trendColor };
    });

    // Горизонтальная сетка + подписи цены слева — без них кривые «висели в
    // воздухе» и было непонятно, какому уровню цены они соответствуют.
    const yTicks = niceAxisTicks(priceMin, priceMax, 4)
      .filter((value) => value >= domainMin && value <= domainMax)
      .map((value) => ({ y: scaleY(value), label: formatIndexPrice(value) }));

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

    return { projected, labels, yTicks, tMin, tMax, trendStartX };
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

  // Подсвеченная кривая: либо под курсором на графике, либо под курсором в легенде.
  const activeSeriesIndex = hover?.seriesIndex ?? legendSeries;

  const active =
    geometry && hover
      ? {
          color:
            geometry.projected[hover.seriesIndex] && geometry.projected[hover.seriesIndex]?.coords[hover.pointIndex]
              ? geometry.projected[hover.seriesIndex]!.coords[hover.pointIndex]!.x >= geometry.trendStartX
                ? geometry.projected[hover.seriesIndex]!.trendColor
                : geometry.projected[hover.seriesIndex]!.color
              : undefined,
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
        <IndexPeriodTabs
          ariaLabel="Период сводного графика"
          className="index-combined-periods"
          period={period}
          onChange={setPeriod}
        />
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
              <defs>
                {geometry.projected.map((entry) => (
                  <linearGradient
                    id={`index-combined-line-${uid}-${entry.id}`}
                    key={entry.id}
                    x1={padding.left}
                    x2={width - padding.right}
                    y1="0"
                    y2="0"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={entry.color} />
                    <stop offset={TREND_BASE_END_OFFSET} stopColor={entry.color} />
                    <stop offset={TREND_SOLID_START_OFFSET} stopColor={entry.trendColor} />
                    <stop offset="100%" stopColor={entry.trendColor} />
                  </linearGradient>
                ))}
              </defs>
              <rect x="0" y="0" width={width} height={height} fill="transparent" />

              {/* Горизонтальная сетка + подписи цены. */}
              {geometry.yTicks.map((tick, i) => (
                <g key={`grid-${i}`}>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={tick.y}
                    y2={tick.y}
                    stroke="var(--line)"
                    strokeWidth="1"
                  />
                  <text x={padding.left - 12} y={tick.y + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
                    {tick.label}
                  </text>
                </g>
              ))}
              {/* Базовая линия оси X. */}
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={baselineY}
                y2={baselineY}
                stroke="var(--line-strong)"
                strokeWidth="1"
              />

              {active?.point ? (
                <line
                  x1={active.point.x}
                  x2={active.point.x}
                  y1={padding.top}
                  y2={baselineY}
                  stroke="#1a202e"
                  strokeDasharray="3 4"
                  strokeOpacity="0.2"
                />
              ) : null}

              {geometry.projected.map((entry, seriesIndex) => {
                const dimmed = activeSeriesIndex !== null && activeSeriesIndex !== seriesIndex;
                const highlighted = activeSeriesIndex === seriesIndex;
                const last = entry.coords[entry.coords.length - 1];
                return (
                  <g key={entry.id} opacity={dimmed ? 0.22 : 1}>
                    <path
                      d={entry.path}
                      fill="none"
                      stroke={`url(#index-combined-line-${uid}-${entry.id})`}
                      strokeWidth={highlighted ? 3.4 : 2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Точка-якорь на последнем значении каждой кривой: показывает
                        «сейчас» и гарантирует видимость даже у короткой серии. */}
                    {last ? (
                      <circle
                        cx={last.x}
                        cy={last.y}
                        r={highlighted ? 4.6 : 3.4}
                        fill={entry.trendColor}
                        stroke="var(--panel)"
                        strokeWidth="1.6"
                      />
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
                  <text key={i} x={label.x} y={height - 12} textAnchor={anchor} fontSize="13" fill="var(--muted)">
                    {label.text}
                  </text>
                );
              })}
            </svg>
          </div>

          <ul className="index-combined-legend">
            {geometry.projected.map((entry, seriesIndex) => (
              <li
                className={`index-combined-legend-item${activeSeriesIndex === seriesIndex ? " is-active" : ""}`}
                key={entry.id}
                onMouseEnter={() => setLegendSeries(seriesIndex)}
                onMouseLeave={() => setLegendSeries((current) => (current === seriesIndex ? null : current))}
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

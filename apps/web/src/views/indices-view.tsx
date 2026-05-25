"use client";

// Раздел «Индексы цен». Вынесен из DataViews.tsx как изолированный модуль:
// у IndicesView нет общих state/хелперов с лентой новостей или базой знаний,
// поэтому он жил в монолите только из-за лени.

import { useEffect, useMemo, useRef, useState } from "react";
import type { NomenclatureCategoryListItem, NomenclatureListItem } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "./_shared";

type IndexPeriod = "2W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "3Y";

const INDEX_PERIOD_LABELS: Record<IndexPeriod, string> = {
  "2W": "2 нед.",
  "1M": "1 мес.",
  "3M": "3 мес.",
  "6M": "6 мес.",
  "1Y": "1 год",
  "2Y": "2 года",
  "3Y": "3 года",
};

export function IndicesView() {
  const { data, state, errorMessage } = useApiQuery(
    "indices",
    () => api.indices.list(),
    [] as NomenclatureCategoryListItem[],
  );
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined);
  const active = data.find((category) => category.slug === activeSlug) ?? data[0];

  useEffect(() => {
    if (!activeSlug && data[0]?.slug) {
      setActiveSlug(data[0].slug);
    }
  }, [data, activeSlug]);

  if (state === "unauthenticated") {
    return <AuthRequired title="Индексы цен" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Индексы цен" />;
  }

  if (state === "error") {
    return <ErrorState title="Индексы цен" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader
          title="Индексы цен на вторсырьё"
          subtitle="Актуальные ценовые индексы по основным категориям сырья."
        />
        <div className="indices-categories">
          {data.map((category) => (
            <button
              className={`indices-category-tab ${category.slug === active?.slug ? "active" : ""}`}
              onClick={() => setActiveSlug(category.slug)}
              key={category.id}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
        {!active || (active.nomenclatures ?? []).length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            В этой категории пока нет опубликованных индексов.
          </p>
        ) : (
          <div className="indices-grid">
            {active.nomenclatures.map((item) => (
              <IndexCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function IndexCard({ item }: { item: NomenclatureListItem }) {
  const [period, setPeriod] = useState<IndexPeriod>("3M");

  // Если в выбранном периоде истории меньше, чем нужно (например, спросили
  // «1 год», а есть только 4 месяца), берём всё, что есть. На бэке
  // filterPriceIndexPoints уже отдаёт сколько накопилось — здесь только
  // фолбэк, если фронт получил пустой массив.
  // Если в выбранном периоде истории меньше, чем нужно (например, спросили
  // «1 год», а есть только 4 месяца), берём ближайший непустой период вниз.
  const chart = item.chart ?? {};
  const fallbackOrder: IndexPeriod[] = [period, "3Y", "2Y", "1Y", "6M", "3M", "1M", "2W"];
  const points: Array<{ date: string | Date; price: number }> =
    fallbackOrder.map((key) => chart[key]).find((arr) => arr && arr.length > 0) ?? [];

  const currentPrice = Number(item.summary?.currentPrice ?? points[points.length - 1]?.price ?? 0);
  const weeklyChange = Number(item.summary?.weeklyChange ?? 0);

  return (
    <article className="index-card">
      <div className="index-card-head">
        <div className="index-card-body">
          <h2 className="index-card-title">{item.name}</h2>
          <p className="index-card-subtitle">
            {item.code}
            {weeklyChange !== 0 ? (
              <>
                {" · "}
                <span className={weeklyChange >= 0 ? "index-change-positive" : "index-change-negative"}>
                  {weeklyChange > 0 ? "+" : ""}
                  {weeklyChange}% за неделю
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="index-current-price">
          <strong>{formatIndexPrice(currentPrice)}</strong>
          <span>{item.unit ?? "₽/т"}</span>
        </div>
      </div>

      <IndexChart points={points} period={period} />

      <div className="index-period-tabs" aria-label="Период графика">
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
    </article>
  );
}

const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatIndexPrice(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

function formatIndexDateLabel(date: Date, period: IndexPeriod) {
  const month = MONTH_LABELS[date.getMonth()];
  return ["1Y", "2Y", "3Y"].includes(period)
    ? `${month} ${date.getFullYear()}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

function formatIndexTooltipDate(date: Date) {
  const month = MONTH_LABELS[date.getMonth()];
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

function buildSmoothChartPath(xs: number[], ys: number[]) {
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

function smoothPricesForScale(prices: number[], period: IndexPeriod, innerWidth: number) {
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

function IndexChart({
  points,
  period,
}: {
  points: Array<{ date: string | Date; price: number }>;
  period: IndexPeriod;
}) {
  // Хук всегда вызывается, до раннего return — иначе сломается порядок hooks.
  const uid = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const lineGradId = `index-line-${uid}`;
  const areaGradId = `index-area-${uid}`;
  const fadeMaskId = `index-fade-${uid}`;
  const fadeGradId = `index-fadegrad-${uid}`;

  // Индекс точки под курсором (null = курсор не над графиком, тогда плашка
  // показывает последнее значение, как раньше).
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setHoverIndex(null);
  }, [period]);

  useEffect(() => {
    if (hoverIndex === null) return;

    function handleDocumentMouseMove(event: MouseEvent) {
      const svg = svgRef.current;
      const target = event.target;
      if (svg && target instanceof Node && svg.contains(target)) return;
      setHoverIndex(null);
    }

    document.addEventListener("mousemove", handleDocumentMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleDocumentMouseMove);
    };
  }, [hoverIndex]);

  if (points.length === 0) {
    return <div className="index-chart-empty">Нет данных для графика</div>;
  }

  const width = 720;
  const height = 260;
  const padding = { top: 40, right: 36, bottom: 42, left: 36 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || max || 1;
  const domainPadding = range * (period === "1M" ? 0.22 : 0.14);
  const domainMin = min - domainPadding;
  const domainMax = max + domainPadding;
  const domainRange = domainMax - domainMin || 1;
  const displayPrices = smoothPricesForScale(prices, period, innerWidth);

  const xs = points.map((_, i) =>
    points.length === 1 ? padding.left + innerWidth / 2 : padding.left + (i / (points.length - 1)) * innerWidth,
  );
  const ys = displayPrices.map(
    (price) => padding.top + innerHeight - ((price - domainMin) / domainRange) * innerHeight,
  );

  const linePath = buildSmoothChartPath(xs, ys);
  const lastIndex = points.length - 1;
  const areaPath = `${linePath} L${xs[lastIndex]!.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${xs[0]!.toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`;

  // Направление градиента: при росте — «прошлое = оранжевый, настоящее = синий»,
  // при падении наоборот. Так визуально подсказываем направление за период.
  const isGrowth = (prices[lastIndex] ?? 0) >= (prices[0] ?? 0);
  const startColor = isGrowth ? "#f5773e" : "#4d73d8";
  const endColor = isGrowth ? "#4d73d8" : "#f5773e";

  // Подписи на оси X: короткие периоды чаще, длинные — реже, чтобы даты не наезжали.
  const labelDivisor = period === "2W" || period === "1M" || period === "3M" ? 4 : 6;
  const labelStep = Math.max(1, Math.floor(points.length / labelDivisor));
  const labels: Array<{ x: number; text: string }> = [];
  const minLabelGap = 112;
  points.forEach((p, i) => {
    if (i % labelStep === 0 || i === lastIndex) {
      const date = new Date(p.date);
      const text = formatIndexDateLabel(date, period);
      const x = xs[i]!;
      const previous = labels[labels.length - 1];
      if (i === lastIndex && previous && (x - previous.x < minLabelGap || previous.text === text)) {
        labels.pop();
      }
      if (labels.length === 0 || x - labels[labels.length - 1]!.x >= minLabelGap || i === lastIndex) {
        labels.push({ x, text });
      }
    }
  });

  const lastX = xs[lastIndex]!;
  const lastY = ys[lastIndex]!;

  // Активная точка: или под курсором (если курсор на графике), или последняя.
  const activeIndex = hoverIndex !== null && hoverIndex >= 0 && hoverIndex <= lastIndex ? hoverIndex : lastIndex;
  const activeX = xs[activeIndex]!;
  const activeY = ys[activeIndex]!;
  const activePrice = prices[activeIndex]!;
  const activeDate = new Date(points[activeIndex]!.date);
  const activeDateLabel = formatIndexTooltipDate(activeDate);

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    // Перевод координаты курсора в систему viewBox.
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    if (points.length === 1) {
      setHoverIndex((current) => (current === 0 ? current : 0));
      return;
    }
    // Ищем ближайшую точку по X.
    let nearest = 0;
    let bestDistance = Math.abs(svgX - xs[0]!);
    for (let i = 1; i < xs.length; i += 1) {
      const distance = Math.abs(svgX - xs[i]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = i;
      }
    }
    setHoverIndex((current) => (current === nearest ? current : nearest));
  }

  // Ширина плашки масштабируем под содержимое: «20 мая · 31 635».
  const tooltipText = `${activeDateLabel} · ${formatIndexPrice(activePrice)}`;
  const tooltipWidth = Math.max(82, tooltipText.length * 7 + 20);
  const tooltipX = Math.min(Math.max(activeX, tooltipWidth / 2 + 6), width - tooltipWidth / 2 - 6);
  const tooltipY = Math.max(activeY - 24, padding.top + 2);
  const isHoveringChart = hoverIndex !== null;

  return (
    <div className="index-chart-wrap">
      <svg
        className="index-chart"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={handleMouseMove}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          {/* Горизонтальный градиент для самой линии. */}
          <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          {/* Тот же горизонтальный градиент для заливки области. */}
          <linearGradient id={areaGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          {/* Вертикальная маска: непрозрачная сверху, прозрачная внизу —
              чтобы заливка плавно угасала к оси X, как было раньше. */}
          <linearGradient id={fadeGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={fadeMaskId}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeGradId})`} />
          </mask>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        <path d={areaPath} fill={`url(#${areaGradId})`} mask={`url(#${fadeMaskId})`} />
        {isHoveringChart ? (
          <line
            x1={activeX}
            x2={activeX}
            y1={padding.top}
            y2={padding.top + innerHeight}
            stroke="#1a202e"
            strokeDasharray="3 4"
            strokeOpacity="0.2"
          />
        ) : null}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${lineGradId})`}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={lastX} cy={lastY} r="6.5" fill={endColor} stroke="white" strokeWidth="2.4" />
        {isHoveringChart && activeIndex !== lastIndex ? (
          <circle cx={activeX} cy={activeY} r="6.5" fill="#1a202e" stroke="white" strokeWidth="2.4" />
        ) : null}

        {/* Метка активной точки: без hover показывает последнее значение. */}
        <g transform={`translate(${tooltipX}, ${tooltipY})`}>
          <rect x={-tooltipWidth / 2} y="-23" width={tooltipWidth} height="28" rx="14" fill="#1a202e" />
          <text x="0" y="-5" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
            {tooltipText}
          </text>
        </g>

        {labels.map((label, i) => (
          <text key={i} x={label.x} y={height - 12} textAnchor="middle" fontSize="13" fill="var(--muted)">
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

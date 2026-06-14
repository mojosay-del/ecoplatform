"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  buildSmoothChartPath,
  formatIndexDateLabel,
  formatIndexPrice,
  formatIndexTooltipDate,
  smoothPricesForScale,
} from "./format";
import { netDirection, TREND_COLOR } from "./trend";
import type { IndexPeriod, IndexPoint } from "./types";

export function IndexChart({ points, period }: { points: IndexPoint[]; period: IndexPeriod }) {
  // useId даёт стабильный идентификатор и на SSR, и на клиенте. Раньше тут был
  // Math.random(): на сервере и при гидрации значения расходились, из-за чего
  // ссылки `fill/stroke="url(#…)"` на части карточек указывали на несуществующий
  // градиент — и кривая/заливка просто не рисовались. Двоеточия из useId
  // экранируем — они недопустимы в SVG id/url(#…).
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
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

  // Единая семантика цвета: линия/заливка/точка зелёные при росте за показанный
  // период, красные при снижении, нейтральные при отсутствии движения. График
  // говорит тем же языком, что таблица движения и чипы (см. trend.ts).
  const color = TREND_COLOR[netDirection(points)];

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

  // Перевод X курсора/пальца в систему viewBox + поиск ближайшей точки.
  function updateHoverFromClientX(clientX: number, rect: DOMRect) {
    if (rect.width === 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    if (points.length === 1) {
      setHoverIndex((current) => (current === 0 ? current : 0));
      return;
    }
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

  function handleMouseMove(event: ReactMouseEvent<SVGSVGElement>) {
    updateHoverFromClientX(event.clientX, event.currentTarget.getBoundingClientRect());
  }

  // Тач: палец читает график так же, как курсор. touch-action: pan-y (в CSS)
  // оставляет вертикальный скролл странице.
  function handleTouch(event: ReactTouchEvent<SVGSVGElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    updateHoverFromClientX(touch.clientX, event.currentTarget.getBoundingClientRect());
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
        // width/height задают интринсик-пропорции: без них Safari при
        // CSS `height:auto` + только viewBox иногда считает высоту нулевой, и
        // график «пропадает». CSS (width:100%) масштабирует svg адаптивно.
        width={width}
        height={height}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouch}
        onTouchStart={handleTouch}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          {/* Вертикальная маска: непрозрачная сверху, прозрачная внизу —
              заливка плавно угасает к оси X. */}
          <linearGradient id={fadeGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.35" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={fadeMaskId}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeGradId})`} />
          </mask>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        <path d={areaPath} fill={color} mask={`url(#${fadeMaskId})`} />
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
        <path d={linePath} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="6.5" fill={color} stroke="white" strokeWidth="2.4" />
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

        {labels.map((label, i) => {
          // Крайние подписи якорим к краям, иначе при textAnchor="middle"
          // половина первой/последней даты уходит за границу SVG и обрезается.
          const anchor = i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle";
          return (
            <text key={i} x={label.x} y={height - 12} textAnchor={anchor} fontSize="13" fill="var(--muted)">
              {label.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

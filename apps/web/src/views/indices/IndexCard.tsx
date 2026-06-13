"use client";

import { useEffect, useMemo, useState } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { formatIndexMovementChange, getIndexAnchorId } from "../index-movement-summary";
import { formatIndexPrice, formatIndexUpdatedDate } from "./format";
import { IndexChart } from "./IndexChart";
import { IndexPeriodTabs } from "./IndexPeriodTabs";
import { trendFromSummary } from "./trend";
import { TrendArrow, TrendChip } from "./TrendChip";
import type { IndexPeriod } from "./types";

export function IndexCard({ item }: { item: NomenclatureListItem }) {
  const chart = item.chart ?? {};

  // Стартовый период подбираем под данные: индексы обновляются редко, и в коротком
  // окне (3 мес.) у номенклатуры бывает всего 1 точка — тогда график вырождался в
  // одиночную «точку» вместо кривой. Берём самый короткий период (от 3 мес.), где
  // есть ≥2 точек и рисуется линия; если такого нет нигде — оставляем 3 мес. и
  // показываем честный единственный отсчёт. Та же логика, что у сводного графика.
  const defaultPeriod = useMemo<IndexPeriod>(() => {
    const order: IndexPeriod[] = ["3M", "6M", "1Y", "2Y", "3Y"];
    for (const value of order) {
      if ((chart[value]?.length ?? 0) >= 2) return value;
    }
    return "3M";
  }, [chart]);

  const [period, setPeriod] = useState<IndexPeriod>(defaultPeriod);

  // Данные обновились (рефетч/смена item) → пересинхронизируем удачный стартовый
  // период. В пределах одного набора defaultPeriod стабилен, поэтому ручной выбор
  // периода пользователем не сбрасывается.
  useEffect(() => {
    setPeriod(defaultPeriod);
  }, [defaultPeriod]);

  // Если в выбранном периоде истории меньше, чем нужно (например, спросили
  // «1 год», а есть только 4 месяца), берём ближайший непустой период вниз.
  const fallbackOrder: IndexPeriod[] = [period, "3Y", "2Y", "1Y", "6M", "3M", "1M", "2W"];
  const points: Array<{ date: string | Date; price: number }> =
    fallbackOrder.map((key) => chart[key]).find((arr) => arr && arr.length > 0) ?? [];

  const currentPrice = Number(item.summary?.currentPrice ?? points[points.length - 1]?.price ?? 0);
  const weeklyChangeRaw = item.summary?.weeklyChange;
  const hasWeekly = typeof weeklyChangeRaw === "number" && Number.isFinite(weeklyChangeRaw);
  // Цвет дельты берём из того же тренда, что и чип: иначе мелкое движение в зоне
  // «стагнации» давало серый чип «Без изменений» рядом с красной дельтой.
  const trend = trendFromSummary(item.summary?.trend);
  const updatedLabel = item.summary?.currentDate ? formatIndexUpdatedDate(item.summary.currentDate) : "";

  return (
    <article className="index-card" id={getIndexAnchorId(item.id)}>
      <div className="index-card-head">
        <div className="index-card-body">
          <h2 className="index-card-title">{item.name}</h2>
          <div className="index-card-tags">
            <span className="index-card-code">{item.code}</span>
            <TrendChip direction={trend} />
          </div>
        </div>
        <div className="index-current-price">
          <strong className="index-num">{formatIndexPrice(currentPrice)}</strong>
          <span className="index-current-unit">{item.unit ?? "₽/т"}</span>
          {hasWeekly ? (
            <span className={`index-delta ${trend} index-num`}>
              <TrendArrow direction={trend} />
              {formatIndexMovementChange(weeklyChangeRaw)} за нед.
            </span>
          ) : (
            <span className="index-delta flat">— за нед.</span>
          )}
        </div>
      </div>

      <IndexChart points={points} period={period} />

      <div className="index-card-foot">
        <IndexPeriodTabs
          ariaLabel="Период графика"
          className="index-card-periods"
          period={period}
          onChange={setPeriod}
        />
        {updatedLabel ? <span className="index-card-updated">обновлено {updatedLabel}</span> : null}
      </div>
    </article>
  );
}

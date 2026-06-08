"use client";

import { useEffect, useMemo, useState } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { getIndexAnchorId } from "../index-movement-summary";
import { formatIndexPrice } from "./format";
import { IndexChart } from "./IndexChart";
import { IndexPeriodTabs } from "./IndexPeriodTabs";
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
  // «1 год», а есть только 4 месяца), берём всё, что есть. На бэке
  // filterPriceIndexPoints уже отдаёт сколько накопилось — здесь только
  // фолбэк, если фронт получил пустой массив.
  // Если в выбранном периоде истории меньше, чем нужно (например, спросили
  // «1 год», а есть только 4 месяца), берём ближайший непустой период вниз.
  const fallbackOrder: IndexPeriod[] = [period, "3Y", "2Y", "1Y", "6M", "3M", "1M", "2W"];
  const points: Array<{ date: string | Date; price: number }> =
    fallbackOrder.map((key) => chart[key]).find((arr) => arr && arr.length > 0) ?? [];

  const currentPrice = Number(item.summary?.currentPrice ?? points[points.length - 1]?.price ?? 0);
  const weeklyChange = Number(item.summary?.weeklyChange ?? 0);

  return (
    <article className="index-card" id={getIndexAnchorId(item.id)}>
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

      <IndexPeriodTabs ariaLabel="Период графика" period={period} onChange={setPeriod} />
    </article>
  );
}

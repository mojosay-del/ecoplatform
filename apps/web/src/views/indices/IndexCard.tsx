"use client";

import { useState } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { getIndexAnchorId } from "../index-movement-summary";
import { INDEX_PERIOD_LABELS } from "./constants";
import { formatIndexPrice } from "./format";
import { IndexChart } from "./IndexChart";
import type { IndexPeriod } from "./types";

export function IndexCard({ item }: { item: NomenclatureListItem }) {
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

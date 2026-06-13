"use client";

// «Пульс рынка» — hero-сводка по активной категории: средняя цена + недельная
// динамика, настроение (растут/падают/стоят) и лидер недели. Отвечает на главный
// вопрос «что с рынком прямо сейчас?» одним взглядом. Метрики недельные (из
// summary), согласованы с чипами карточек.

import { useMemo } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { formatIndexMovementChange, getIndexMarketPulse } from "../index-movement-summary";
import { materialColor } from "../marketplace/materials";
import { formatIndexPrice, pickRecentSeries } from "./format";
import { IndexSparkline } from "./IndexSparkline";
import { directionFromChange } from "./trend";
import { TrendArrow } from "./TrendChip";

export function IndexMarketPulse({
  items,
  categorySlug,
  categoryName,
}: {
  items: NomenclatureListItem[];
  categorySlug?: string;
  categoryName?: string;
}) {
  const pulse = useMemo(() => getIndexMarketPulse(items), [items]);
  if (pulse.count === 0) return null;

  const accent = materialColor(categorySlug);
  const unit = items.find((item) => item.unit)?.unit ?? "₽/т";
  const avgDir = directionFromChange(pulse.averageWeeklyChange);
  const leaderDir = directionFromChange(pulse.leader?.change ?? null);
  const total = pulse.risingCount + pulse.fallingCount + pulse.flatCount;

  return (
    <section className="index-pulse" aria-label={`Пульс рынка${categoryName ? `: ${categoryName}` : ""}`}>
      <article className="index-pulse-card" style={{ borderTopColor: accent, borderTopWidth: 3 }}>
        <span className="index-pulse-label">Средняя цена{categoryName ? ` · ${categoryName.toLowerCase()}` : ""}</span>
        <div className="index-pulse-price index-num">
          {pulse.averagePrice !== null ? formatIndexPrice(pulse.averagePrice) : "—"}
          <span className="index-pulse-unit">{unit}</span>
        </div>
        {pulse.averageWeeklyChange !== null ? (
          <span className={`index-delta ${avgDir} index-num`}>
            <TrendArrow direction={avgDir} />
            {formatIndexMovementChange(pulse.averageWeeklyChange)} за неделю
          </span>
        ) : (
          <span className="index-delta flat">нет недельных данных</span>
        )}
      </article>

      <article className="index-pulse-card">
        <span className="index-pulse-label">Настроение рынка</span>
        <div className="index-pulse-sentiment index-num">
          <span className="up">
            <strong>{pulse.risingCount}</strong> растут
          </span>
          <span className="down">
            <strong>{pulse.fallingCount}</strong> падают
          </span>
          <span className="flat">
            <strong>{pulse.flatCount}</strong> без изм.
          </span>
        </div>
        <div
          className="index-pulse-bar"
          role="img"
          aria-label={`${pulse.risingCount} растут, ${pulse.fallingCount} падают, ${pulse.flatCount} без изменений`}
        >
          {total === 0 ? (
            <span className="flat" style={{ flex: 1 }} />
          ) : (
            <>
              {pulse.risingCount > 0 ? <span className="up" style={{ flex: pulse.risingCount }} /> : null}
              {pulse.fallingCount > 0 ? <span className="down" style={{ flex: pulse.fallingCount }} /> : null}
              {pulse.flatCount > 0 ? <span className="flat" style={{ flex: pulse.flatCount }} /> : null}
            </>
          )}
        </div>
      </article>

      <article className="index-pulse-card">
        <span className="index-pulse-label">Лидер недели</span>
        {pulse.leader ? (
          <>
            <div className="index-pulse-leader-name">{pulse.leader.item.name}</div>
            <div className="index-pulse-leader-foot">
              <span className={`index-delta ${leaderDir} index-num`}>
                <TrendArrow direction={leaderDir} />
                {formatIndexMovementChange(pulse.leader.change)}
              </span>
              <IndexSparkline
                points={pickRecentSeries(pulse.leader.item.chart)}
                direction={leaderDir}
                width={84}
                height={30}
              />
            </div>
          </>
        ) : (
          <div className="index-pulse-leader-name index-pulse-muted">Пока без заметных движений</div>
        )}
      </article>
    </section>
  );
}

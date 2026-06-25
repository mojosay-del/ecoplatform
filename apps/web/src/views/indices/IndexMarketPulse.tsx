"use client";

// «Пульс рынка» — hero-сводка по рынку: настроение (растут/падают/стоят) и
// лидер недели. Отвечает на главный вопрос «что с рынком прямо сейчас?» одним
// взглядом. Метрики недельные (из summary), согласованы с чипами карточек.

import { useMemo } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import { formatIndexMovementChange, getIndexMarketPulse } from "../index-movement-summary";
import { pickRecentSeries } from "./format";
import { IndexSparkline } from "./IndexSparkline";
import { directionFromChange } from "./trend";
import { TrendArrow } from "./TrendChip";

export function IndexMarketPulse({ items }: { items: NomenclatureListItem[] }) {
  const pulse = useMemo(() => getIndexMarketPulse(items), [items]);
  if (pulse.count === 0) return null;

  const leaderDir = directionFromChange(pulse.leader?.change ?? null);
  const total = pulse.risingCount + pulse.fallingCount + pulse.flatCount;

  return (
    <section className="index-pulse" aria-label="Пульс рынка">
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
            <span className="flat u-flex-1" />
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
          <div className="index-pulse-leader-content">
            <div className="index-pulse-leader-main">
              <div className="index-pulse-leader-name">{pulse.leader.item.name}</div>
              <span className={`index-delta ${leaderDir} index-num index-pulse-leader-delta`}>
                <TrendArrow direction={leaderDir} />
                {formatIndexMovementChange(pulse.leader.change)}
              </span>
            </div>
            <div className="index-pulse-leader-chart" aria-hidden="true">
              <IndexSparkline
                points={pickRecentSeries(pulse.leader.item.chart)}
                direction={leaderDir}
                width={108}
                height={42}
              />
            </div>
          </div>
        ) : (
          <div className="index-pulse-leader-name index-pulse-muted">Пока без заметных движений</div>
        )}
      </article>
    </section>
  );
}

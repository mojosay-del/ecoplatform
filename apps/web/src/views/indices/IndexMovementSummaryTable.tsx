"use client";

import { useMemo, useState } from "react";
import type { NomenclatureListItem } from "@ecoplatform/shared";
import {
  formatIndexMovementChange,
  getIndexAnchorId,
  getIndexMovementSummary,
  type IndexMovementRow,
} from "../index-movement-summary";
import { INDEX_PERIOD_LABELS } from "./constants";
import { formatIndexPrice } from "./format";
import { IndexPeriodTabs } from "./IndexPeriodTabs";
import type { IndexPeriod } from "./types";

export function IndexMovementSummaryTable({ items }: { items: NomenclatureListItem[] }) {
  const [period, setPeriod] = useState<IndexPeriod>("2W");
  const summary = useMemo(() => getIndexMovementSummary(items, period), [items, period]);
  const rows: Array<IndexMovementRow & { kind: "rising" | "falling" | "flat" }> = [
    ...summary.rising.map((row) => ({ ...row, kind: "rising" as const })),
    ...summary.falling.map((row) => ({ ...row, kind: "falling" as const })),
    ...summary.flat.map((row) => ({ ...row, kind: "flat" as const })),
  ];
  const periodLabel = INDEX_PERIOD_LABELS[period].toLowerCase();

  return (
    <section className="index-movement-summary" aria-labelledby="index-movement-title">
      <div className="index-movement-head">
        <div className="index-movement-title">
          <h2 id="index-movement-title">Движение индексов</h2>
          <span>Рост и снижение за {periodLabel}</span>
        </div>
        <IndexPeriodTabs
          ariaLabel="Период движения индексов"
          className="index-movement-periods"
          period={period}
          onChange={setPeriod}
        />
      </div>

      {rows.length === 0 ? (
        <p className="index-movement-empty">За выбранный период нет заметного роста или снижения.</p>
      ) : (
        <div className="index-movement-table-wrap">
          <table className="index-movement-table">
            <colgroup>
              <col className="index-movement-col-kind" />
              <col className="index-movement-col-name" />
              <col className="index-movement-col-code" />
              <col className="index-movement-col-price" />
              <col className="index-movement-col-change" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Динамика</th>
                <th scope="col">Индекс</th>
                <th scope="col">Код</th>
                <th scope="col">Цена</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isRising = row.kind === "rising";
                const isFalling = row.kind === "falling";
                const kindClass = isRising ? "positive" : isFalling ? "negative" : "neutral";

                return (
                  <tr key={`${row.kind}-${row.item.id}`}>
                    <td>
                      <span className={`index-movement-kind ${kindClass}`}>
                        {isRising ? "Рост" : isFalling ? "Снижение" : "Без изм."}
                      </span>
                    </td>
                    <td>
                      <a className="index-movement-link" href={`#${getIndexAnchorId(row.item.id)}`}>
                        {row.item.name}
                      </a>
                    </td>
                    <td data-label="Код">
                      <span className="index-movement-code">{row.item.code}</span>
                    </td>
                    <td data-label="Цена">
                      {formatIndexPrice(row.currentPrice)} {row.item.unit ?? "₽/т"}
                    </td>
                    <td data-label="Изменение">
                      <strong className={`index-movement-change ${kindClass}`}>
                        {formatIndexMovementChange(row.change)}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

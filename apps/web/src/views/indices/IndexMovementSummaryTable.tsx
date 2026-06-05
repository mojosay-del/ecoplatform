import {
  formatIndexWeeklyChange,
  getIndexAnchorId,
  type IndexMovementRow,
  type IndexMovementSummary,
} from "../index-movement-summary";
import { formatIndexPrice } from "./format";

export function IndexMovementSummaryTable({ summary }: { summary: IndexMovementSummary }) {
  const rows: Array<IndexMovementRow & { kind: "rising" | "falling" }> = [
    ...summary.rising.map((row) => ({ ...row, kind: "rising" as const })),
    ...summary.falling.map((row) => ({ ...row, kind: "falling" as const })),
  ];

  return (
    <section className="index-movement-summary" aria-labelledby="index-movement-title">
      <div className="index-movement-head">
        <div>
          <span className="index-movement-eyebrow">За неделю</span>
          <h2 id="index-movement-title">Движение индексов</h2>
        </div>
        <span className="index-movement-note">Топ-3 рост и падение</span>
      </div>

      {rows.length === 0 ? (
        <p className="index-movement-empty">За неделю нет заметного роста или снижения.</p>
      ) : (
        <div className="index-movement-table-wrap">
          <table className="index-movement-table">
            <thead>
              <tr>
                <th scope="col">Динамика</th>
                <th scope="col">Индекс</th>
                <th scope="col">Цена</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isRising = row.kind === "rising";
                const currentPrice = Number(row.item.summary?.currentPrice ?? 0);

                return (
                  <tr key={`${row.kind}-${row.item.id}`}>
                    <td>
                      <span className={`index-movement-kind ${isRising ? "positive" : "negative"}`}>
                        {isRising ? "Рост" : "Снижение"}
                      </span>
                    </td>
                    <td>
                      <a className="index-movement-link" href={`#${getIndexAnchorId(row.item.id)}`}>
                        {row.item.name}
                      </a>
                      <span className="index-movement-code">{row.item.code}</span>
                    </td>
                    <td data-label="Цена">
                      {formatIndexPrice(currentPrice)} {row.item.unit ?? "₽/т"}
                    </td>
                    <td data-label="Изменение">
                      <strong className={`index-movement-change ${isRising ? "positive" : "negative"}`}>
                        {formatIndexWeeklyChange(row.weeklyChange)}
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

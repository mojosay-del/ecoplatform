"use client";

import { type CSSProperties } from "react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { DATE_FORMAT, DATE_TIME_FORMAT, formatNumber } from "./format";

type RegistrationSeries = AdminDashboardSummary["registrationSeries"];

export function AdminRegistrationChart({
  generatedAt,
  maxRegistrations,
  series,
}: {
  generatedAt: string;
  maxRegistrations: number;
  series: RegistrationSeries;
}) {
  const chartStats = getRegistrationChartStats(series);

  return (
    <section className="admin-chart-panel" aria-labelledby="admin-registration-chart-title">
      <header className="admin-dashboard-panel-head">
        <div>
          <h2 id="admin-registration-chart-title">Регистрации за 30 дней</h2>
          <p>Обновлено {DATE_TIME_FORMAT.format(new Date(generatedAt))}</p>
        </div>
        <dl className="admin-chart-legend">
          <div>
            <dt>Всего</dt>
            <dd>{formatNumber(chartStats.total)}</dd>
          </div>
          <div>
            <dt>Среднее</dt>
            <dd>{formatNumber(chartStats.avg)}/дн</dd>
          </div>
          <div>
            <dt>Пик</dt>
            <dd>{formatNumber(chartStats.peak)}</dd>
          </div>
        </dl>
      </header>
      <div className="admin-chart-plot" style={{ "--avg-ratio": chartStats.avgRatio } as CSSProperties}>
        <div className="admin-registration-chart" role="list">
          {series.map((point, index) => {
            const height = Math.max(8, Math.round((point.count / maxRegistrations) * 100));
            const date = new Date(`${point.date}T00:00:00`);
            const isEdgeLabel = index === 0 || index === series.length - 1;
            return (
              <div className="admin-chart-day" key={point.date} role="listitem">
                <span
                  aria-label={`${DATE_FORMAT.format(date)}: ${point.count}`}
                  className="admin-chart-bar"
                  style={
                    {
                      "--bar-delay": `${index * 16}ms`,
                      "--bar-height": `${height}%`,
                    } as CSSProperties
                  }
                >
                  <span className="admin-chart-bar-tooltip">
                    {DATE_FORMAT.format(date)} · {formatNumber(point.count)}
                  </span>
                </span>
                {isEdgeLabel ? <span className="admin-chart-day-label">{DATE_FORMAT.format(date)}</span> : null}
              </div>
            );
          })}
        </div>
        {chartStats.total > 0 ? (
          <span className="admin-chart-avg" aria-hidden>
            <span className="admin-chart-avg-label">среднее {formatNumber(chartStats.avg)}</span>
          </span>
        ) : null}
      </div>
    </section>
  );
}

function getRegistrationChartStats(series: RegistrationSeries) {
  if (series.length === 0) return { total: 0, avg: 0, peak: 0, avgRatio: 0 };
  const total = series.reduce((sum, point) => sum + point.count, 0);
  const peak = Math.max(...series.map((point) => point.count));
  const avgExact = total / series.length;
  return { total, avg: Math.round(avgExact), peak, avgRatio: peak > 0 ? avgExact / peak : 0 };
}

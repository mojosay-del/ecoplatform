"use client";

import { type CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { KPI_CARDS } from "./dashboard-config";
import { deltaTone, formatNumber } from "./format";
import type { KpiPolarity } from "./types";

export function AdminKpiGrid({
  dashboard,
  cards = KPI_CARDS,
}: {
  dashboard: AdminDashboardSummary;
  cards?: typeof KPI_CARDS;
}) {
  return (
    <div className="admin-kpi-grid">
      {cards.map((item, index) => {
        const Icon = item.icon;
        const previous = item.trendKey ? dashboard.kpiTrends[item.trendKey] : null;
        const delta = previous === null ? null : dashboard.kpis[item.key] - previous;
        return (
          <Link
            className={`admin-kpi-card admin-kpi-card-${item.tone}`}
            href={item.href}
            key={item.key}
            style={{ "--kpi-delay": `${index * 45}ms` } as CSSProperties}
          >
            <span className="admin-kpi-card-icon" aria-hidden>
              <Icon size={18} />
            </span>
            <span className="admin-kpi-card-copy">
              <span className="admin-kpi-card-label">{item.label}</span>
              <strong className="admin-kpi-card-value">{formatNumber(dashboard.kpis[item.key])}</strong>
              {delta !== null ? <KpiDelta delta={delta} polarity={item.polarity ?? "up-good"} /> : null}
              <small>{item.hint}</small>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <section className="admin-dashboard admin-dashboard-loading" aria-label="Загрузка сводки администратора">
      <div className="admin-kpi-grid" aria-hidden>
        {KPI_CARDS.map((item) => (
          <div className="admin-kpi-card admin-kpi-card-skeleton" key={item.key}>
            <span className="admin-kpi-card-icon" />
            <span className="admin-kpi-card-copy">
              <span className="admin-skeleton-line admin-skeleton-line-short" />
              <span className="admin-skeleton-line admin-skeleton-line-value" />
              <span className="admin-skeleton-line" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiDelta({ delta, polarity }: { delta: number; polarity: KpiPolarity }) {
  const tone = deltaTone(delta, polarity);
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`admin-kpi-delta admin-kpi-delta-${tone}`} title="За сутки — к этому же времени вчера">
      <Icon aria-hidden size={12} />
      {sign}
      {formatNumber(delta)}
    </span>
  );
}

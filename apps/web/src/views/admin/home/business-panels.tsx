"use client";

import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS, labelFromMap } from "../../../lib/display-labels";
import { formatNumber } from "./format";

export function AdminBusinessPanels({ business }: { business: AdminDashboardSummary["business"] }) {
  return (
    <section className="admin-business-grid" aria-label="Подписки и компании">
      <section className="admin-business-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Подписки</h2>
            <p>Конверсия и структура платного доступа</p>
          </div>
        </header>
        <div className="admin-business-hero">
          <strong className="admin-business-hero-value">{business.conversion.percent}%</strong>
          <span className="admin-business-hero-label">
            конверсия демо → платная
            <br />
            {formatNumber(business.conversion.convertedCompanies)} из {formatNumber(business.conversion.totalCompanies)}{" "}
            компаний
          </span>
        </div>
        <dl className="admin-stat-list">
          <div className="admin-stat-row">
            <dt>{labelFromMap(SUBSCRIPTION_PLAN_LABELS, "basic")}</dt>
            <dd>{formatNumber(business.subscriptionsByPlan.basic)}</dd>
          </div>
          <div className="admin-stat-row">
            <dt>{labelFromMap(SUBSCRIPTION_PLAN_LABELS, "extended")}</dt>
            <dd>{formatNumber(business.subscriptionsByPlan.extended)}</dd>
          </div>
          <div className="admin-stat-row">
            <dt>Новых подписок за месяц</dt>
            <dd>{formatNumber(business.newSubscriptionsThisMonth)}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-business-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Компании по статусам</h2>
            <p>Всего {formatNumber(business.conversion.totalCompanies)}</p>
          </div>
        </header>
        {business.companiesByStatus.length ? (
          <dl className="admin-stat-list">
            {business.companiesByStatus.map((row) => (
              <div className="admin-stat-row" key={row.status}>
                <dt>{labelFromMap(COMPANY_STATUS_LABELS, row.status)}</dt>
                <dd>{formatNumber(row.count)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="page-subtitle">Компаний пока нет.</p>
        )}
      </section>
    </section>
  );
}

"use client";

import Link from "next/link";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { HEALTH_DEPENDENCIES, OPERATION_CARDS } from "./dashboard-config";
import { formatHealthStatus, formatNumber, TIME_FORMAT } from "./format";

export function AdminOperationsPanels({
  generatedAt,
  operations,
  systemHealth,
}: {
  generatedAt: string;
  operations: AdminDashboardSummary["operations"];
  systemHealth: AdminDashboardSummary["systemHealth"];
}) {
  return (
    <section className="admin-ops-health-grid" aria-label="Операции и здоровье системы">
      <section className="admin-operations-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Требует внимания</h2>
            <p>Операционные сигналы, которые лучше не пропускать</p>
          </div>
        </header>
        <div className="admin-operation-list">
          {OPERATION_CARDS.map((item) => {
            const Icon = item.icon;
            const value = operations[item.key];
            return (
              <Link
                className={`admin-operation-row${value > 0 ? " is-attention" : ""}`}
                href={item.href}
                key={item.key}
              >
                <span className="admin-operation-row-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="admin-operation-row-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <span className="admin-operation-row-value">{formatNumber(value)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="admin-health-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Здоровье системы</h2>
            <p>Ключевые зависимости · проверено в {TIME_FORMAT.format(new Date(generatedAt))}</p>
          </div>
        </header>
        <dl className="admin-health-list">
          {HEALTH_DEPENDENCIES.map((item) => {
            const Icon = item.icon;
            const status = systemHealth[item.key];
            return (
              <div className={`admin-health-row admin-health-row-${status}`} key={item.key}>
                <dt>
                  <span className="admin-health-row-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="admin-health-row-copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </dt>
                <dd>
                  <span className={`admin-health-status admin-health-status-${status}`}>
                    {formatHealthStatus(status)}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </section>
  );
}

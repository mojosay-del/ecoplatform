"use client";

// Полный дашборд администратора: KPI-карточки, операционные сигналы, здоровье
// системы, бизнес-метрики, график регистраций и лента аудита. Видит только
// роль admin (для остального персонала — StaffRoleSummary в quick-links.tsx).

import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { StatusPill } from "../../../components/StatusPill";
import { AdminAuditFeed } from "./audit-feed";
import { AdminBusinessPanels } from "./business-panels";
import { AdminDashboardSkeleton, AdminKpiGrid } from "./kpi-cards";
import { AdminOperationsPanels } from "./operations-panels";
import { AdminRegistrationChart } from "./registration-chart";

export function AdminDashboard({
  dashboard,
  errorMessage,
  maxRegistrations,
  state,
}: {
  dashboard: AdminDashboardSummary | null;
  errorMessage: string | null;
  maxRegistrations: number;
  state: "idle" | "loading" | "ready" | "error";
}) {
  if (state === "loading" && !dashboard) {
    return <AdminDashboardSkeleton />;
  }

  if (state === "error" && errorMessage) {
    return (
      <StatusPill as="p" variant="danger">
        {errorMessage}
      </StatusPill>
    );
  }

  if (!dashboard) return null;

  return (
    <section className="admin-dashboard" aria-label="Сводка администратора">
      <AdminKpiGrid dashboard={dashboard} />

      <AdminOperationsPanels
        generatedAt={dashboard.generatedAt}
        operations={dashboard.operations}
        systemHealth={dashboard.systemHealth}
      />

      <AdminBusinessPanels business={dashboard.business} />

      <div className="admin-dashboard-main">
        <AdminRegistrationChart
          generatedAt={dashboard.generatedAt}
          maxRegistrations={maxRegistrations}
          series={dashboard.registrationSeries}
        />
        <AdminAuditFeed events={dashboard.recentAuditEvents} />
      </div>
    </section>
  );
}

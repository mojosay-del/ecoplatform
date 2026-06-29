"use client";

// Раздел «Аналитика» панели управления: состояние платформы и бизнес-метрики.
// Полный дашборд (KPI, операционные сигналы, здоровье системы, подписки,
// компании, регистрации, аудит) вынесен сюда из лендинга /admin. Сам дашборд
// переиспользуется из ../home/dashboard. Доступен только роли admin.

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { useApiQuery } from "../../shared";
import { AdminDashboard } from "../home/dashboard";

export function AdminAnalyticsView() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");

  // Единый паттерн загрузки (useApiQuery): дашборд тянем только для админа,
  // иначе ключ null → запрос не уходит.
  const {
    data: dashboard,
    state,
    errorMessage,
  } = useApiQuery<AdminDashboardSummary | null>(
    isAdmin ? "admin-analytics-dashboard" : null,
    () => api.admin.dashboard(),
    null,
  );

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  const maxRegistrations = useMemo(() => {
    if (!dashboard) return 1;
    return Math.max(1, ...dashboard.registrationSeries.map((point) => point.count));
  }, [dashboard]);

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Аналитика</h1>
          <p className="page-subtitle">Состояние платформы, операционные сигналы и бизнес-метрики.</p>
        </header>

        {isAdmin ? (
          <AdminDashboard
            dashboard={dashboard}
            errorMessage={errorMessage}
            maxRegistrations={maxRegistrations}
            state={state}
          />
        ) : (
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        )}
      </section>
    </AppShell>
  );
}

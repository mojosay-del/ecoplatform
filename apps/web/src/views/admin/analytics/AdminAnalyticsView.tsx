"use client";

// Раздел «Аналитика» панели управления: состояние платформы и бизнес-метрики.
// Полный дашборд (KPI, операционные сигналы, здоровье системы, подписки,
// компании, регистрации, аудит) вынесен сюда из лендинга /admin. Сам дашборд
// переиспользуется из ../home/dashboard. Доступен только роли admin.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { errorText, api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { AdminDashboard } from "../home/dashboard";

export function AdminAnalyticsView() {
  const router = useRouter();
  const { ready, token, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [dashboardState, setDashboardState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  useEffect(() => {
    let isActive = true;
    if (!ready || !token || !isAdmin) {
      setDashboard(null);
      setDashboardState("idle");
      setDashboardError(null);
      return;
    }

    setDashboardState("loading");
    setDashboardError(null);
    api.admin
      .dashboard({ token })
      .then((data) => {
        if (!isActive) return;
        setDashboard(data);
        setDashboardState("ready");
      })
      .catch((error) => {
        if (!isActive) return;
        setDashboard(null);
        setDashboardState("error");
        setDashboardError(errorText(error, "Не удалось загрузить сводку."));
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin, ready, token]);

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
            errorMessage={dashboardError}
            maxRegistrations={maxRegistrations}
            state={dashboardState}
          />
        ) : (
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        )}
      </section>
    </AppShell>
  );
}

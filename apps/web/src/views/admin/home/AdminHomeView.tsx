"use client";

// Главная админ-панель: грузит сводку (admin) или overview (прочий персонал) и
// раскладывает на блоки. Сами блоки вынесены в соседние модули:
//   dashboard.tsx    — полный дашборд администратора
//   quick-links.tsx  — быстрые переходы + сводка задач персонала
//   format.ts/types.ts — форматтеры и типы

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AdminDashboardSummary, AdminStaffSummary } from "@ecoplatform/shared";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { visibleAdminHomeGroups } from "../../../components/admin-panel-tabs";
import { AdminDashboard } from "./dashboard";
import { AdminQuickLinks, StaffRoleSummary } from "./quick-links";

export function AdminHomeView() {
  const router = useRouter();
  const { ready, token, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [dashboardState, setDashboardState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [staffSummary, setStaffSummary] = useState<AdminStaffSummary | null>(null);

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
        setDashboardError(error instanceof Error ? error.message : "Не удалось загрузить сводку.");
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin, ready, token]);

  // Роль-сводка нужна только не-админ-персоналу: у админа есть полный дашборд
  // (включая модерацию), дублировать незачем.
  useEffect(() => {
    let isActive = true;
    if (!ready || !token || isAdmin || roleKey.length === 0) {
      setStaffSummary(null);
      return;
    }

    api.admin
      .overview({ token })
      .then((data) => {
        if (isActive) setStaffSummary(data);
      })
      .catch(() => {
        if (isActive) setStaffSummary(null);
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin, ready, token, roleKey]);

  const groups = visibleAdminHomeGroups(roles);
  const maxRegistrations = useMemo(() => {
    if (!dashboard) return 1;
    return Math.max(1, ...dashboard.registrationSeries.map((point) => point.count));
  }, [dashboard]);

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Панель управления</h1>
          <p className="page-subtitle">Сводка по платформе, последним действиям и быстрым административным разделам.</p>
        </header>

        {isAdmin ? (
          <AdminDashboard
            dashboard={dashboard}
            errorMessage={dashboardError}
            maxRegistrations={maxRegistrations}
            state={dashboardState}
          />
        ) : null}

        {!isAdmin && staffSummary ? <StaffRoleSummary summary={staffSummary} /> : null}

        {groups.length === 0 ? (
          <p className="page-subtitle">Открываем основной раздел…</p>
        ) : (
          <AdminQuickLinks groups={groups} />
        )}
      </section>
    </AppShell>
  );
}

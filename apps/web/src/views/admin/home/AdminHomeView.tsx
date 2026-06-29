"use client";

// Главная панель управления (/admin) — role-aware командный центр:
//   admin            — командный центр (пульс KPI + «Требует внимания» + здоровье) и лаунчпад
//   content_manager  — сводка «Контент в работе» + лаунчпад раздела «Контент»
//   moderator        — сводка очереди модерации + лаунчпад
// Полный дашборд администратора (графики, бизнес-метрики, аудит) — на вкладке
// «Аналитика» (views/admin/analytics). Блоки экрана:
//   command-center.tsx — командный центр администратора
//   quick-links.tsx    — лаунчпад разделов + сводка задач персонала
//   format.ts/types.ts — форматтеры и типы

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AdminDashboardSummary, AdminStaffSummary } from "@ecoplatform/shared";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { visibleAdminHomeGroups } from "../../../components/admin-panel-tabs";
import { useSupportAwaitingCount } from "../../../lib/support/use-support-queue";
import { useApiQuery } from "../../shared";
import { AdminCommandCenter } from "./command-center";
import { AdminQuickLinks, StaffRoleSummary } from "./quick-links";

export function AdminHomeView() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const isStaff = !isAdmin && roleKey.length > 0;

  // Единый паттерн загрузки (useApiQuery), условный через null-ключ: командный
  // центр тянем только админу, сводку задач — остальному персоналу. Ошибку
  // сводки персонала намеренно глушим (data остаётся null → блок не рендерим).
  const {
    data: dashboard,
    state: dashboardState,
    errorMessage: dashboardError,
  } = useApiQuery<AdminDashboardSummary | null>(isAdmin ? "admin-dashboard" : null, () => api.admin.dashboard(), null);

  const { data: staffSummary } = useApiQuery<AdminStaffSummary | null>(
    isStaff ? "admin-overview" : null,
    () => api.admin.overview(),
    null,
  );

  const groups = visibleAdminHomeGroups(roles);
  const supportAwaiting = useSupportAwaitingCount();

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Панель управления</h1>
          <p className="page-subtitle">
            {isAdmin
              ? "Командный центр платформы: ключевые метрики, текущие задачи и быстрые переходы."
              : "Быстрый доступ к вашим разделам и текущим задачам."}
          </p>
        </header>

        {isAdmin ? (
          <AdminCommandCenter dashboard={dashboard} errorMessage={dashboardError} state={dashboardState} />
        ) : staffSummary ? (
          <StaffRoleSummary summary={staffSummary} />
        ) : null}

        {groups.length === 0 ? (
          <p className="page-subtitle">Открываем основной раздел…</p>
        ) : (
          <AdminQuickLinks groups={groups} badges={{ "/admin/support": supportAwaiting }} />
        )}
      </section>
    </AppShell>
  );
}

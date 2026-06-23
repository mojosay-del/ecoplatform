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
import { useEffect, useState } from "react";
import type { AdminDashboardSummary, AdminStaffSummary } from "@ecoplatform/shared";
import { errorText, api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { visibleAdminHomeGroups } from "../../../components/admin-panel-tabs";
import { AdminCommandCenter } from "./command-center";
import { AdminQuickLinks, StaffRoleSummary } from "./quick-links";

export function AdminHomeView() {
  const router = useRouter();
  const { ready, token, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const [staffSummary, setStaffSummary] = useState<AdminStaffSummary | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [dashboardState, setDashboardState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  // Сводка задач — для не-админ-персонала (контент-менеджер, модератор).
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

  // Командный центр (живой срез) — только для администратора.
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

  const groups = visibleAdminHomeGroups(roles);

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
          <AdminQuickLinks groups={groups} />
        )}
      </section>
    </AppShell>
  );
}

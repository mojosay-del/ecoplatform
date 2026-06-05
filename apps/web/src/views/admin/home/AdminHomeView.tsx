"use client";

// Главная админ-панель: навигационный хаб по разделам. Полный дашборд
// администратора вынесен в отдельную вкладку «Аналитика» (views/admin/analytics).
// Блоки этого экрана:
//   quick-links.tsx  — быстрые переходы + сводка задач персонала
//   format.ts/types.ts — форматтеры и типы

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminStaffSummary } from "@ecoplatform/shared";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { AppShell } from "../../../components/AppShell";
import { visibleAdminHomeGroups } from "../../../components/admin-panel-tabs";
import { AdminQuickLinks, StaffRoleSummary } from "./quick-links";

export function AdminHomeView() {
  const router = useRouter();
  const { ready, token, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const [staffSummary, setStaffSummary] = useState<AdminStaffSummary | null>(null);

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  // Роль-сводка нужна только не-админ-персоналу: у админа есть отдельная
  // вкладка «Аналитика» с полным дашбордом, дублировать незачем.
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

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Панель управления</h1>
          <p className="page-subtitle">Быстрый доступ к административным разделам платформы.</p>
        </header>

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

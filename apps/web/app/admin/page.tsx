"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../src/components/AppShell";
import { useAuth } from "../../src/lib/auth";

export default function AdminIndexPage() {
  const router = useRouter();
  const { ready, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const roles = user?.platformRoles ?? [];
    if (roles.includes("admin") || roles.includes("content_manager")) {
      router.replace("/admin/content/news");
      return;
    }
    if (roles.includes("moderator")) {
      router.replace("/admin/moderation");
      return;
    }
    router.replace("/news");
  }, [ready, router, user]);

  return (
    <AppShell>
      <section className="page">
        <h1 className="page-title">Панель управления</h1>
        <p className="page-subtitle">Открываем доступный раздел…</p>
      </section>
    </AppShell>
  );
}

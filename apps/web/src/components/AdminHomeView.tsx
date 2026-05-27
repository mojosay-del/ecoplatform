"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { AppShell } from "./AppShell";
import { visibleAdminHomeGroups } from "./admin-panel-tabs";

export function AdminHomeView() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  const groups = visibleAdminHomeGroups(roles);

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Панель управления</h1>
          <p className="page-subtitle">Административные разделы и CMS ЭкоПлатформы.</p>
        </header>

        {groups.length === 0 ? (
          <p className="page-subtitle">Открываем основной раздел…</p>
        ) : (
          <div className="admin-home-groups">
            {groups.map((group) => (
              <section className="admin-home-section" key={group.title}>
                <header className="admin-home-section-head">
                  <h2>{group.title}</h2>
                </header>
                <div className="admin-home-links">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link className="admin-home-link" href={item.href} key={item.href}>
                        <span className="admin-home-link-icon" aria-hidden>
                          <Icon size={18} />
                        </span>
                        <span className="admin-home-link-text">
                          <strong className="admin-home-link-title">{item.label}</strong>
                          <small className="admin-home-link-description">{item.description}</small>
                        </span>
                        <ArrowRight className="admin-home-link-arrow" aria-hidden size={17} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

"use client";

// Блоки для не-админ-персонала: быстрые переходы по доступным разделам и
// сводка задач (черновики контента, очередь модерации).

import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Newspaper, ShieldAlert, type LucideIcon } from "lucide-react";
import type { AdminStaffSummary } from "@ecoplatform/shared";
import { visibleAdminHomeGroups } from "../../../components/admin-panel-tabs";
import { formatNumber } from "./format";

export function AdminQuickLinks({
  groups,
  badges,
}: {
  groups: ReturnType<typeof visibleAdminHomeGroups>;
  // Карта href → число для бейджа на карточке раздела (напр. сколько обращений
  // ждут ответа). Универсальная — годится и для будущих очередей.
  badges?: Record<string, number>;
}) {
  return (
    <section className="admin-home-shortcuts" aria-labelledby="admin-home-shortcuts-title">
      <header className="admin-home-shortcuts-head">
        <h2 id="admin-home-shortcuts-title">Разделы панели</h2>
      </header>
      <div className="admin-home-groups">
        {groups.map((group) => (
          <section className={`admin-home-section admin-home-section-${group.accent}`} key={group.title}>
            <header className="admin-home-section-head">
              <div className="admin-home-section-heading">
                <h3>{group.title}</h3>
                {group.caption ? <p className="admin-home-section-caption">{group.caption}</p> : null}
              </div>
              <span className="admin-home-section-count">{group.items.length}</span>
            </header>
            <div className="admin-home-links">
              {group.items.map((item, index) => {
                const Icon = item.icon;
                const badge = badges?.[item.href] ?? 0;
                return (
                  <Link
                    className="admin-home-link"
                    href={item.href}
                    key={item.href}
                    style={{ "--link-delay": `${index * 40}ms` } as CSSProperties}
                  >
                    <span className="admin-home-link-icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <span className="admin-home-link-text">
                      <strong className="admin-home-link-title">{item.label}</strong>
                      <small className="admin-home-link-description">{item.description}</small>
                    </span>
                    {badge > 0 ? (
                      <span className="admin-home-link-badge" aria-label={`${badge} в очереди`}>
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                    <ArrowRight className="admin-home-link-arrow" aria-hidden size={17} />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

const STAFF_CONTENT_METRICS: Array<{
  key: keyof NonNullable<AdminStaffSummary["content"]>;
  label: string;
  href: string;
  icon: LucideIcon;
}> = [
  { key: "newsDrafts", label: "Черновики новостей", href: "/admin/content/news", icon: Newspaper },
  { key: "lessonDrafts", label: "Уроки без публикации", href: "/admin/content/education", icon: GraduationCap },
  { key: "knowledgeDrafts", label: "Статьи без публикации", href: "/admin/content/knowledge-base", icon: BookOpen },
];

export function StaffRoleSummary({ summary }: { summary: AdminStaffSummary }) {
  const { content, moderation } = summary;
  if (!content && !moderation) return null;

  return (
    <section className="admin-staff-summary" aria-label="Сводка по вашим задачам">
      {content ? (
        <section className="admin-staff-card">
          <header className="admin-dashboard-panel-head">
            <div>
              <h2>Контент в работе</h2>
              <p>Черновики, ожидающие публикации</p>
            </div>
          </header>
          <div className="admin-staff-metrics">
            {STAFF_CONTENT_METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <Link className="admin-staff-metric" href={metric.href} key={metric.key}>
                  <span className="admin-staff-metric-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <strong className="admin-staff-metric-value">{formatNumber(content[metric.key])}</strong>
                  <span className="admin-staff-metric-label">{metric.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {moderation ? (
        <section className="admin-staff-card">
          <header className="admin-dashboard-panel-head">
            <div>
              <h2>Модерация</h2>
              <p>Кейсы, требующие решения</p>
            </div>
          </header>
          <Link
            className={`admin-staff-queue${moderation.openCases > 0 ? " is-attention" : ""}`}
            href="/admin/moderation"
          >
            <span className="admin-staff-queue-icon" aria-hidden>
              <ShieldAlert size={22} />
            </span>
            <span className="admin-staff-queue-copy">
              <strong>Очередь модерации</strong>
              <small>{moderation.openCases > 0 ? "Есть кейсы в работе" : "Очередь пуста"}</small>
            </span>
            <span className="admin-staff-queue-value">{formatNumber(moderation.openCases)}</span>
          </Link>
        </section>
      ) : null}
    </section>
  );
}

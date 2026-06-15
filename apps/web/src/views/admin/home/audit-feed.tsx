"use client";

import Link from "next/link";
import { ScrollText } from "lucide-react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { auditVisual, DATE_TIME_FORMAT, formatAction, formatActor, formatRelativeTime } from "./format";

export function AdminAuditFeed({ events }: { events: AdminDashboardSummary["recentAuditEvents"] }) {
  return (
    <section className="admin-audit-panel" aria-labelledby="admin-audit-feed-title">
      <header className="admin-dashboard-panel-head">
        <div>
          <h2 id="admin-audit-feed-title">Последние события аудита</h2>
          <p>5 свежих действий админки</p>
        </div>
        <Link className="button secondary" href="/admin/journals">
          <ScrollText aria-hidden size={16} />
          Журнал
        </Link>
      </header>
      {events.length ? (
        <ol className="admin-audit-feed">
          {events.map((event) => {
            const visual = auditVisual(event.action);
            const Icon = visual.icon;
            const createdAt = new Date(event.createdAt);
            return (
              <li className="admin-audit-feed-item" key={event.id}>
                <span className={`admin-audit-feed-icon admin-audit-tone-${visual.tone}`} aria-hidden>
                  <Icon size={13} />
                </span>
                <span className="admin-audit-feed-copy">
                  <strong>{formatAction(event.action)}</strong>
                  <small>
                    {event.entityLabel} · {formatActor(event.actor)} ·{" "}
                    <time dateTime={event.createdAt} title={DATE_TIME_FORMAT.format(createdAt)}>
                      {formatRelativeTime(createdAt)}
                    </time>
                  </small>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="page-subtitle">Событий пока нет.</p>
      )}
    </section>
  );
}

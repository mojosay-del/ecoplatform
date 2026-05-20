"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }

    let cancelled = false;
    const load = () =>
      apiFetch<{ count: number }>("/notifications/unread-count", { token })
        .then((data) => {
          if (!cancelled) setCount(data.count);
        })
        .catch(() => {
          /* тихо игнорируем сбои поллинга, чтобы не спамить пользователя */
        });

    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    window.addEventListener("notifications:changed", load);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("notifications:changed", load);
    };
  }, [token]);

  return (
    <Link className="icon-button notification-bell" href="/notifications" title="Уведомления">
      <Bell size={25} />
      {count > 0 ? <span className="notification-badge">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}

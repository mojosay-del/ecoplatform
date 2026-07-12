"use client";

import { useRef, useState } from "react";
import "./notifications.css";
import { useUnreadCount, usePopoverNotifications } from "../lib/notifications/use-notifications";
import { NotificationsPopover } from "./NotificationsPopover";
import { AnimatedNavIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./app-shell/nav-icons";

const POPOVER_LIMIT = 10;

// Колокольчик в шапке. Раньше был ссылкой на /notifications, теперь —
// триггер для popover'а с последними уведомлениями. Полный список остаётся
// доступен из popover'а ссылкой «Открыть все». Счётчик и список уведомлений
// держатся в общем react-query кэше (см. lib/notifications/use-notifications):
// поллинг ставится на паузу в фоне, запросы дедуплицируются с popover/View,
// гонки и setState-после-unmount исключены самим react-query.
export function NotificationBell() {
  const count = useUnreadCount();
  const [open, setOpen] = useState(false);
  // Список тянем лениво — только пока popover открыт.
  const { items, loading } = usePopoverNotifications(POPOVER_LIMIT, open);
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);
  const badgeLabel = count > 99 ? "99+" : String(count);

  return (
    <div className="notification-bell-root" data-tour="shell-notifications">
      <button
        type="button"
        className="icon-button notification-bell"
        title="Уведомления"
        aria-label="Открыть уведомления"
        aria-expanded={open}
        data-notification-bell-trigger="true"
        {...iconPlayback}
        onClick={() => setOpen((value) => !value)}
      >
        <AnimatedNavIcon name="notifications" ref={iconRef} size={26} />
        {count > 0 ? <span className={`notification-badge ${count > 9 ? "wide" : ""}`}>{badgeLabel}</span> : null}
      </button>
      <NotificationsPopover open={open} onClose={() => setOpen(false)} items={items} loading={loading} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthMeUser } from "@ecoplatform/shared";
import { getDemoBannerState, shouldShowDemoBanner } from "./demo-banner-state";
import { subscriptionSelectionHref } from "../lib/subscription-access";

const MINUTE_MS = 60 * 1000;

export function DemoBanner({ user, pathname }: { user: AuthMeUser | null; pathname: string }) {
  const [now, setNow] = useState(() => new Date());
  const demoEndsAt = user?.company?.demoEndsAt;
  const visible = shouldShowDemoBanner(user, pathname, now);
  const state = visible && demoEndsAt ? getDemoBannerState(demoEndsAt, now) : null;

  useEffect(() => {
    if (!demoEndsAt) return undefined;

    const intervalId = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(intervalId);
  }, [demoEndsAt]);

  if (!state) return null;

  const accessibleText =
    state.mode === "critical"
      ? `Пробный доступ закончится через ${state.text}. Активировать подписку`
      : `Пробный доступ закончится через ${state.text}. Активировать подписку`;

  return (
    <Link
      aria-label={accessibleText}
      className={`demo-banner demo-banner-${state.mode}`}
      data-tooltip="Активировать подписку"
      href={subscriptionSelectionHref(pathname)}
      title="Активировать подписку"
    >
      <span className="demo-banner-time" aria-live="polite">
        {state.text}
      </span>
      <span className="demo-banner-currency" aria-hidden="true">
        ₽
      </span>
    </Link>
  );
}

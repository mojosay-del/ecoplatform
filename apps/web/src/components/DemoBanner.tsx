"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuthMeUser } from "@ecoplatform/shared";
import { getDemoBannerState, shouldShowDemoBanner } from "./demo-banner-state";

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

  return (
    <div className={`demo-banner demo-banner-${state.mode}`} role="status" aria-live="polite">
      <span>{state.text}</span>
      <Link className="button demo-banner-action" href="/account/billing">
        Активировать подписку
      </Link>
    </div>
  );
}

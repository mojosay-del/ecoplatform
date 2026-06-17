"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "../../lib/auth";
import { shouldRedirectFromMarketplace } from "./marketplace-route-access";

export function MarketplaceRouteGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const shouldRedirect = shouldRedirectFromMarketplace(user);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/news");
    }
  }, [router, shouldRedirect]);

  return shouldRedirect ? null : children;
}

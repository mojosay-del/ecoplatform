"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DOCUMENTATION_NAV_BREAKPOINT = "(max-width: 1180px)";

export function useDocumentationMobileNav() {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;

    const media = window.matchMedia(DOCUMENTATION_NAV_BREAKPOINT);
    if (!media.matches) {
      setNavOpen(false);
      return;
    }

    function onMediaChange(event: MediaQueryListEvent) {
      if (!event.matches) setNavOpen(false);
    }

    media.addEventListener("change", onMediaChange);
    return () => media.removeEventListener("change", onMediaChange);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  return { closeNav, navOpen, openNav };
}

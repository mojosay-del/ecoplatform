"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const KNOWLEDGE_NAV_BREAKPOINT = "(max-width: 1180px)";

export function useKnowledgeMobileNav() {
  const pathname = usePathname();
  const [materialNavOpen, setMaterialNavOpen] = useState(false);

  const openMaterialNav = useCallback(() => setMaterialNavOpen(true), []);
  const closeMaterialNav = useCallback(() => setMaterialNavOpen(false), []);

  useEffect(() => {
    setMaterialNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!materialNavOpen) return;

    const media = window.matchMedia(KNOWLEDGE_NAV_BREAKPOINT);
    if (!media.matches) {
      setMaterialNavOpen(false);
      return;
    }

    function onMediaChange(event: MediaQueryListEvent) {
      if (!event.matches) setMaterialNavOpen(false);
    }

    media.addEventListener("change", onMediaChange);
    return () => media.removeEventListener("change", onMediaChange);
  }, [materialNavOpen]);

  useEffect(() => {
    if (!materialNavOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMaterialNavOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [materialNavOpen]);

  useEffect(() => {
    if (!materialNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [materialNavOpen]);

  return {
    closeMaterialNav,
    materialNavOpen,
    openMaterialNav,
  };
}

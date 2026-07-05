"use client";

import { useEffect, useState } from "react";

// Scroll-spy для ленты-индекса каталога: следит за секциями категорий и отдаёт
// slug той, что сейчас в верхней трети вьюпорта.
export function useCatalogScrollSpy(slugs: string[]): string | null {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const slugsKey = slugs.join(",");

  useEffect(() => {
    const ids = slugsKey ? slugsKey.split(",") : [];
    if (ids.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const slug = entry.target.getAttribute("data-catalog-slug");
          if (!slug) continue;
          if (entry.isIntersecting) {
            visible.set(slug, entry.boundingClientRect.top);
          } else {
            visible.delete(slug);
          }
        }
        if (visible.size === 0) return;
        const topmost = Array.from(visible.entries()).sort((a, b) => a[1] - b[1])[0];
        if (topmost) setActiveSlug(topmost[0]);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );

    for (const slug of ids) {
      const element = document.querySelector(`[data-catalog-slug="${slug}"]`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [slugsKey]);

  return activeSlug;
}

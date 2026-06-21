"use client";

import { useEffect } from "react";
import { ACCOUNT_SECTION_NAVIGATE_EVENT, type AccountSectionId } from "../../components/app-shell-nav";
import { ACCOUNT_SCROLL_OFFSET, ACCOUNT_SETTINGS_SECTIONS } from "./constants";
import { accountSectionDomId, dispatchActiveAccountSection, scrollAccountSectionIntoView } from "./dom";

export function useAccountSectionNavigation({
  targetLayoutKey,
  targetSection,
}: {
  targetLayoutKey: string;
  targetSection: AccountSectionId;
}) {
  const visibleSections = ACCOUNT_SETTINGS_SECTIONS;
  const visibleSectionsKey = visibleSections.join("|");

  useEffect(() => {
    const timeouts: number[] = [];
    const frame = window.requestAnimationFrame(() => {
      // На прямом заходе/смене секции — мгновенно: плавную анимацию
      // прерывали первые ре-рендеры, и страница оставалась наверху.
      timeouts.push(window.setTimeout(() => scrollAccountSectionIntoView(targetSection, "auto"), 80));
      timeouts.push(window.setTimeout(() => scrollAccountSectionIntoView(targetSection, "auto"), 280));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [targetLayoutKey, targetSection, visibleSectionsKey]);

  useEffect(() => {
    function onNavigate(event: Event) {
      const sectionId = (event as CustomEvent<{ section?: AccountSectionId }>).detail?.section;
      if (!sectionId || !visibleSections.includes(sectionId)) return;
      scrollAccountSectionIntoView(sectionId);
    }

    window.addEventListener(ACCOUNT_SECTION_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ACCOUNT_SECTION_NAVIGATE_EVENT, onNavigate);
  }, [visibleSectionsKey, visibleSections]);

  useEffect(() => {
    if (visibleSections.length === 0) return;

    let frame = 0;
    let lastDispatched: AccountSectionId | null = null;

    function computeActive() {
      const offset = ACCOUNT_SCROLL_OFFSET + 12;
      const items = visibleSections
        .map((sectionId) => {
          const element = document.getElementById(accountSectionDomId(sectionId));
          return element ? { sectionId, top: element.getBoundingClientRect().top } : null;
        })
        .filter((item): item is { sectionId: AccountSectionId; top: number } => item !== null);

      const first = items[0];
      if (!first) return;

      const scrollBottom = window.scrollY + window.innerHeight;
      const pageBottom = document.documentElement.scrollHeight;
      let active: AccountSectionId = first.sectionId;

      if (pageBottom - scrollBottom <= 8) {
        active = (items[items.length - 1] ?? first).sectionId;
      } else {
        for (const item of items) {
          if (item.top <= offset) active = item.sectionId;
        }
      }

      if (active !== lastDispatched) {
        lastDispatched = active;
        dispatchActiveAccountSection(active);
      }
    }

    function onScrollOrResize() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        computeActive();
      });
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    computeActive();
    const t1 = window.setTimeout(computeActive, 200);
    const t2 = window.setTimeout(computeActive, 700);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visibleSectionsKey, visibleSections]);
}

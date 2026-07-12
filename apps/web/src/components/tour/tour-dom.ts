"use client";

import { useEffect, useState } from "react";
import { domRectToTourRect, isRectComfortablyInViewport, tourRectsAlmostEqual, type TourRect } from "./tour-geometry";
import { selectRunnableSteps } from "./tour-logic";

// Cookie-баннер (z 9999) лежит выше тура — пока он на экране, автозапуск ждёт.
const COOKIE_BANNER_SELECTOR = ".cookie-banner";

export function tourAnchorSelector(anchor: string): string {
  return `[data-tour="${anchor}"]`;
}

export function findTourAnchor(anchor: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(tourAnchorSelector(anchor));
  return element && isElementVisible(element) ? element : null;
}

// Критерий видимости — как в use-dialog-a11y: скрытые display:none не считаются.
function isElementVisible(element: HTMLElement): boolean {
  return Boolean(element.offsetParent || element.getClientRects().length > 0);
}

export function presentTourAnchors(steps: ReadonlyArray<{ anchor: string }>): Set<string> {
  const present = new Set<string>();
  for (const step of steps) {
    if (!present.has(step.anchor) && findTourAnchor(step.anchor)) present.add(step.anchor);
  }
  return present;
}

export function isCookieBannerVisible(): boolean {
  return Boolean(document.querySelector(COOKIE_BANNER_SELECTOR));
}

export function tourDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = window.setTimeout(finish, ms);
    function finish() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort() {
      window.clearTimeout(id);
      finish();
    }
    signal?.addEventListener("abort", onAbort);
  });
}

// Ждать выполнения условия поллингом. Без timeoutMs — до отмены через signal.
export async function waitForCondition(
  predicate: () => boolean,
  { signal, intervalMs = 200, timeoutMs }: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  const startedAt = Date.now();
  while (!signal?.aborted) {
    if (predicate()) return true;
    if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) return false;
    await tourDelay(intervalMs, signal);
  }
  return false;
}

// Контент страниц грузится асинхронно: ждём обязательные якоря (до timeoutMs),
// затем даём settleMs на дозагрузку опциональных и снимаем финальный набор шагов.
export async function waitForRunnableSteps<T extends { anchor: string; optional?: boolean }>(
  steps: readonly T[],
  {
    signal,
    timeoutMs = 6000,
    intervalMs = 150,
    settleMs = 350,
  }: { signal?: AbortSignal; timeoutMs?: number; intervalMs?: number; settleMs?: number } = {},
): Promise<T[] | null> {
  const ready = await waitForCondition(() => selectRunnableSteps(steps, presentTourAnchors(steps)) !== null, {
    signal,
    intervalMs,
    timeoutMs,
  });
  if (!ready || signal?.aborted) return null;

  await tourDelay(settleMs, signal);
  if (signal?.aborted) return null;

  return selectRunnableSteps(steps, presentTourAnchors(steps));
}

// rAF-слежение за целью: свежий getBoundingClientRect каждый кадр (паттерн
// scroll-spy проекта), колбэк — только при реальном изменении rect.
export function watchTourAnchorRect(anchor: string, onChange: (rect: TourRect | null) => void): () => void {
  let frame = 0;
  let last: TourRect | null = null;
  let reportedMissing = false;

  const tick = () => {
    const element = findTourAnchor(anchor);
    if (!element) {
      if (!reportedMissing) {
        reportedMissing = true;
        last = null;
        onChange(null);
      }
    } else {
      reportedMissing = false;
      const rect = domRectToTourRect(element.getBoundingClientRect());
      if (!tourRectsAlmostEqual(last, rect)) {
        last = rect;
        onChange(rect);
      }
    }
    frame = window.requestAnimationFrame(tick);
  };

  frame = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(frame);
}

// Прокрутить страницу к цели, если она вне «комфортной» зоны. Закреплённые
// (fixed/sticky) цели — топбар, сайдбар — не прокручиваем: их rect финальный,
// а scrollIntoView зря дёрнул бы страницу.
export function scrollTourAnchorIntoView(anchor: string, reducedMotion: boolean): void {
  const element = findTourAnchor(anchor);
  if (!element || isViewportPinned(element)) return;

  const rect = domRectToTourRect(element.getBoundingClientRect());
  if (isRectComfortablyInViewport(rect, window.innerWidth, window.innerHeight)) return;

  element.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
}

function isViewportPinned(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    const { position } = window.getComputedStyle(node);
    if (position === "fixed" || position === "sticky") return true;
    node = node.parentElement;
  }
  return false;
}

// Реактивный matchMedia: на узких экранах карточка тура становится bottom-sheet.
export function useMediaMatch(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const update = () => setMatches(mediaQueryList.matches);
    update();
    mediaQueryList.addEventListener("change", update);
    return () => mediaQueryList.removeEventListener("change", update);
  }, [query]);

  return matches;
}

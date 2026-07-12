"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "../../lib/use-dialog-a11y";
import { scrollTourAnchorIntoView, useMediaMatch, watchTourAnchorRect } from "./tour-dom";
import { inflateTourRect, type TourRect } from "./tour-geometry";
import { TourCard } from "./TourCard";
import { TourSpotlight } from "./TourSpotlight";
import type { TourStep } from "./tour-types";

const SHEET_MEDIA_QUERY = "(max-width: 640px)";
const DEFAULT_SPOTLIGHT_PADDING = 8;
const DEFAULT_SPOTLIGHT_RADIUS = 14;

// Оверлей активного тура: затемнение + спотлайт + карточка шага. Скролл
// пользователя заблокирован перехватом wheel/touchmove (body НЕ лочим — иначе
// сломается программный подскролл к цели между шагами). Esc закрывает,
// стрелки ←/→ листают, фокус заперт внутри (useDialogA11y).
export function TourOverlay({
  steps,
  onStepNavChange,
  onDismiss,
}: {
  steps: TourStep[];
  // Шагу нужен видимый сайдбар → AppShell открывает drawer / разворачивает меню.
  onStepNavChange: (needsNav: boolean) => void;
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const isSheet = useMediaMatch(SHEET_MEDIA_QUERY);

  const step = steps[Math.min(index, steps.length - 1)]!;
  const isLast = index >= steps.length - 1;

  useDialogA11y(overlayRef, { onEscape: onDismiss, restoreFocus: true });

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [steps.length]);

  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    onStepNavChange(Boolean(step.needsNav));
  }, [onStepNavChange, step]);

  // Подскролл к цели — чуть позже сайдбар-эмфазы, чтобы layout устаканился.
  useEffect(() => {
    const id = window.setTimeout(() => scrollTourAnchorIntoView(step.anchor, reducedMotion), 80);
    return () => window.clearTimeout(id);
  }, [reducedMotion, step]);

  // Прежний rect живёт до первого кадра нового слежения — спотлайт морфится
  // от цели к цели без «мигания».
  useEffect(() => watchTourAnchorRect(step.anchor, setTargetRect), [step]);

  // Цель пропала из DOM (перестройка списка) — не держим пустой вырез.
  useEffect(() => {
    if (targetRect !== null) return;
    const id = window.setTimeout(() => {
      if (isLast) onDismiss();
      else goNext();
    }, 700);
    return () => window.clearTimeout(id);
  }, [goNext, isLast, onDismiss, targetRect]);

  useEffect(() => {
    const node = overlayRef.current;
    if (!node) return;
    const prevent = (event: Event) => event.preventDefault();
    node.addEventListener("wheel", prevent, { passive: false });
    node.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      node.removeEventListener("wheel", prevent);
      node.removeEventListener("touchmove", prevent);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (isLast) onDismiss();
        else goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, isLast, onDismiss]);

  const spotlightRect = useMemo(
    () => (targetRect ? inflateTourRect(targetRect, step.padding ?? DEFAULT_SPOTLIGHT_PADDING) : null),
    [step.padding, targetRect],
  );

  return createPortal(
    <div aria-labelledby="tour-step-title" aria-modal="true" className="tour-overlay" ref={overlayRef} role="dialog">
      <TourSpotlight
        anchor={step.anchor}
        radius={step.radius ?? DEFAULT_SPOTLIGHT_RADIUS}
        rect={spotlightRect}
        reducedMotion={reducedMotion}
      />
      <TourCard
        index={index}
        isSheet={isSheet}
        onDismiss={onDismiss}
        onNext={goNext}
        onPrev={goPrev}
        reducedMotion={reducedMotion}
        step={step}
        targetRect={spotlightRect}
        total={steps.length}
      />
    </div>,
    document.body,
  );
}

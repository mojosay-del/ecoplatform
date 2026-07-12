"use client";

import { arrow, computePosition, flip, offset, shift, type Placement, type Side } from "@floating-ui/dom";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TourRect } from "./tour-geometry";
import type { TourStep } from "./tour-types";

const CARD_SPRING = { type: "spring", stiffness: 300, damping: 34 } as const;

type CardPosition = {
  x: number;
  y: number;
  side: Side;
  arrowX: number | null;
  arrowY: number | null;
};

// Карточка шага: позиционируется floating-ui относительно выреза спотлайта
// (offset/flip/shift/arrow), между шагами скользит spring-ом, контент меняется
// кроссфейдом. На узких экранах (isSheet) — фиксированный bottom-sheet без стрелки.
export function TourCard({
  step,
  index,
  total,
  targetRect,
  isSheet,
  reducedMotion,
  onNext,
  onPrev,
  onDismiss,
}: {
  step: TourStep;
  index: number;
  total: number;
  targetRect: TourRect | null;
  isSheet: boolean;
  reducedMotion: boolean;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const hasPositionedRef = useRef(false);
  const [position, setPosition] = useState<CardPosition | null>(null);
  // Счётчик пересчётов: контент шага меняет высоту карточки уже ПОСЛЕ
  // кроссфейда — ResizeObserver триггерит повторный computePosition.
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => setResizeTick((tick) => tick + 1));
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (isSheet || !targetRect) {
      setPosition(null);
      return;
    }
    const card = cardRef.current;
    const arrowElement = arrowRef.current;
    if (!card || !arrowElement) return;

    let cancelled = false;
    const virtualTarget = {
      getBoundingClientRect: () => ({
        x: targetRect.x,
        y: targetRect.y,
        width: targetRect.width,
        height: targetRect.height,
        top: targetRect.y,
        left: targetRect.x,
        right: targetRect.x + targetRect.width,
        bottom: targetRect.y + targetRect.height,
      }),
    };

    void computePosition(virtualTarget, card, {
      placement: (step.placement ?? "bottom") as Placement,
      middleware: [
        offset(18),
        flip({ padding: 16 }),
        shift({ padding: 16 }),
        arrow({ element: arrowElement, padding: 14 }),
      ],
    }).then((result) => {
      if (cancelled) return;
      setPosition({
        x: Math.round(result.x),
        y: Math.round(result.y),
        side: result.placement.split("-")[0] as Side,
        arrowX: result.middlewareData.arrow?.x ?? null,
        arrowY: result.middlewareData.arrow?.y ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isSheet, resizeTick, step, targetRect]);

  useEffect(() => {
    if (position && !hasPositionedRef.current) hasPositionedRef.current = true;
  }, [position]);

  const isLast = index === total - 1;
  const ready = isSheet || position !== null;
  // Первая установка позиции — мгновенно (карточка появляется на месте),
  // дальше — spring-скольжение между шагами.
  const positionTransition = reducedMotion || !hasPositionedRef.current ? ({ duration: 0 } as const) : CARD_SPRING;

  const arrowStyle: CSSProperties = {};
  if (position?.arrowX != null) arrowStyle.left = position.arrowX;
  if (position?.arrowY != null) arrowStyle.top = position.arrowY;

  return (
    <motion.div
      className={`tour-card${isSheet ? " is-sheet" : ""}${ready ? " is-ready" : ""}`}
      data-side={position?.side ?? "bottom"}
      ref={cardRef}
      initial={false}
      animate={isSheet ? { x: 0, y: 0 } : { x: position?.x ?? 0, y: position?.y ?? 0 }}
      transition={positionTransition}
    >
      <button className="tour-card-close" type="button" onClick={onDismiss} aria-label="Закрыть инструкцию">
        <X size={17} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="tour-card-content"
          exit={reducedMotion ? undefined : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          key={step.anchor}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <p className="tour-card-eyebrow">
            Шаг {index + 1} из {total}
          </p>
          <h2 className="tour-card-title" id="tour-step-title">
            {step.title}
          </h2>
          <p className="tour-card-body">{step.body}</p>
        </motion.div>
      </AnimatePresence>
      <div className="tour-card-footer">
        {isLast ? null : (
          <button className="tour-card-skip" type="button" onClick={onDismiss}>
            Пропустить
          </button>
        )}
        <div className="tour-card-dots" aria-hidden="true">
          {Array.from({ length: total }).map((_, dot) => (
            <span className={`tour-dot${dot === index ? " is-active" : ""}`} key={dot} />
          ))}
        </div>
        <div className="tour-card-actions">
          {index > 0 ? (
            <button className="tour-btn tour-btn-ghost" type="button" onClick={onPrev}>
              Назад
            </button>
          ) : null}
          <button className="tour-btn tour-btn-primary" type="button" onClick={isLast ? onDismiss : onNext}>
            {isLast ? "Готово" : "Далее"}
          </button>
        </div>
      </div>
      <div
        aria-hidden="true"
        className={`tour-card-arrow${isSheet ? " is-hidden" : ""}`}
        ref={arrowRef}
        style={arrowStyle}
      />
    </motion.div>
  );
}

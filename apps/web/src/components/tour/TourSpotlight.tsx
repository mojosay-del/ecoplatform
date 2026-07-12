"use client";

import { motion } from "motion/react";
import type { TourRect } from "./tour-geometry";

// Пружина морфа выреза между шагами — в тон celebration-анимациям проекта.
const SPOTLIGHT_SPRING = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 } as const;

// Затемнение экрана с «вырезом» вокруг цели: SVG-маска во весь вьюпорт, вырез
// и кольцо-свечение анимируются spring-морфом при смене шага. rect приходит
// уже с отступом (inflateTourRect), в координатах вьюпорта.
export function TourSpotlight({
  anchor,
  rect,
  radius,
  reducedMotion,
}: {
  anchor: string;
  rect: TourRect | null;
  radius: number;
  reducedMotion: boolean;
}) {
  const transition = reducedMotion ? ({ duration: 0 } as const) : SPOTLIGHT_SPRING;

  return (
    <div className="tour-veil" aria-hidden="true">
      <svg className="tour-veil-svg" width="100%" height="100%">
        <defs>
          <mask id="tour-spotlight-mask" maskUnits="userSpaceOnUse">
            <rect width="100%" height="100%" fill="#fff" />
            {rect ? (
              <motion.rect
                initial={false}
                animate={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height, rx: radius }}
                transition={transition}
                fill="#000"
              />
            ) : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" className="tour-veil-shade" mask="url(#tour-spotlight-mask)" />
      </svg>
      {rect ? (
        <motion.div
          className="tour-spotlight-ring"
          initial={false}
          animate={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height, borderRadius: radius }}
          transition={transition}
        >
          {/* Одноразовый пульс при входе в шаг (key=anchor перезапускает CSS-анимацию). */}
          {reducedMotion ? null : <span className="tour-spotlight-pulse" key={anchor} />}
        </motion.div>
      ) : null}
    </div>
  );
}

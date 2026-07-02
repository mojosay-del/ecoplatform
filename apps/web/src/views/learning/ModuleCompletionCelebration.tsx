"use client";

// Празднование 100% прохождения модуля: оверлей со спринг-чекмарком и
// брендовым «салютом» из частиц на motion. Готовой Lottie-анимации в проекте
// нет — если появится JSON, частицы можно заменить ленивым lottie-web по
// паттерну components/app-shell/iconsax-lottie-icon.tsx.

import Link from "next/link";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const PARTICLES = Array.from({ length: 14 }, (_, index) => {
  const angle = (index / 14) * Math.PI * 2;
  const distance = 86 + (index % 3) * 26;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    delay: 0.24 + (index % 5) * 0.03,
    size: index % 3 === 0 ? 10 : 7,
    tone: index % 2 === 0 ? "is-brand" : "is-soft",
  };
});

export function ModuleCompletionCelebration({
  moduleTitle,
  moduleHref,
  onClose,
}: {
  moduleTitle: string;
  moduleHref: string;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label="Модуль пройден"
      aria-modal="true"
      className="module-complete-backdrop"
      initial={reducedMotion ? false : { opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <motion.section
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="module-complete-card"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.92, y: 18 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="module-complete-burst" aria-hidden="true">
          {reducedMotion
            ? null
            : PARTICLES.map((particle, index) => (
                <motion.span
                  animate={{ x: particle.x, y: particle.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  className={`module-complete-particle ${particle.tone}`}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  key={index}
                  style={{ width: particle.size, height: particle.size }}
                  transition={{ duration: 1.1, delay: particle.delay, ease: "easeOut" }}
                />
              ))}
          <motion.span
            animate={{ scale: 1 }}
            className="module-complete-check"
            initial={reducedMotion ? false : { scale: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
          >
            <Check size={34} strokeWidth={3} />
          </motion.span>
        </div>
        <h2 className="module-complete-title">Модуль пройден!</h2>
        <p className="module-complete-subtitle">{moduleTitle}</p>
        <div className="module-complete-actions">
          <Link className="button" href={moduleHref}>
            К модулю
          </Link>
          <Link className="button secondary" href="/education">
            К курсам
          </Link>
        </div>
      </motion.section>
    </motion.div>
  );
}

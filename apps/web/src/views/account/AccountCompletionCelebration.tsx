"use client";

// Празднование 100% заполнения профиля: спринг-чекмарк и брендовый «салют»
// из частиц — тот же характер, что у ModuleCompletionCelebration в «Обучении».

import { useEffect } from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

const PARTICLES = Array.from({ length: 14 }, (_, index) => {
  const angle = (index / 14) * Math.PI * 2;
  const distance = 78 + (index % 3) * 24;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    delay: 0.24 + (index % 5) * 0.03,
    size: index % 3 === 0 ? 10 : 7,
    tone: index % 2 === 0 ? "is-brand" : "is-soft",
  };
});

export function AccountCompletionCelebration({ onClose }: { onClose: () => void }) {
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
      aria-label="Профиль заполнен полностью"
      aria-modal="true"
      className="account-complete-backdrop"
      initial={reducedMotion ? false : { opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <motion.section
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="account-complete-card"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.92, y: 18 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="account-complete-burst" aria-hidden="true">
          {reducedMotion
            ? null
            : PARTICLES.map((particle, index) => (
                <motion.span
                  animate={{ x: particle.x, y: particle.y, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
                  className={`account-complete-particle ${particle.tone}`}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  key={index}
                  style={{ width: particle.size, height: particle.size }}
                  transition={{ duration: 1.1, delay: particle.delay, ease: "easeOut" }}
                />
              ))}
          <motion.span
            animate={{ scale: 1 }}
            className="account-complete-check"
            initial={reducedMotion ? false : { scale: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }}
          >
            <Check size={34} strokeWidth={3} />
          </motion.span>
        </div>
        <h2 className="account-complete-title">Профиль заполнен на 100%!</h2>
        <p className="account-complete-subtitle">Все возможности платформы открыты. Отличная работа.</p>
        <div className="account-complete-actions">
          <button className="button" onClick={onClose} type="button">
            Продолжить
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

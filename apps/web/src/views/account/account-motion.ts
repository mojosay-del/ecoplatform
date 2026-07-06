// Общие motion-варианты кабинета. Ключ и изинг те же, что в «Обучении»
// (ModuleHero/EducationView) — единый характер движения по платформе.

export const ACCOUNT_EASE = [0.22, 1, 0.36, 1] as const;

export const accountStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const accountItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: ACCOUNT_EASE } },
};

export const accountBlock = (delay = 0) => ({
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, delay, ease: ACCOUNT_EASE } },
});

import { z } from "zod";

// ── Онбординг-туры (первичные инструкции) ──────────────────────────────────
// Единый источник истины для ключей ознакомительных туров: web использует их
// в определениях шагов и маппинге маршрутов, api валидирует ими отметку
// прохождения. Пройденные ключи хранятся в User.onboardingToursCompleted и
// фиксируются за пользователем навсегда (любое закрытие тура = «пройден»).
export const ONBOARDING_TOUR_KEYS = [
  "platform",
  "account",
  "education",
  "indices",
  "knowledge-base",
  "documentation",
  "forum",
  "calculator-retail",
] as const;

export type OnboardingTourKey = (typeof ONBOARDING_TOUR_KEYS)[number];

export function isOnboardingTourKey(value: string): value is OnboardingTourKey {
  return (ONBOARDING_TOUR_KEYS as readonly string[]).includes(value);
}

export const onboardingTourCompleteDtoSchema = z.object({
  tour: z.enum(ONBOARDING_TOUR_KEYS),
});

export type OnboardingTourCompleteDto = z.infer<typeof onboardingTourCompleteDtoSchema>;

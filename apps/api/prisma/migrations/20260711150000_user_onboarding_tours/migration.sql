-- Онбординг-туры: ключи пройденных первичных инструкций (ONBOARDING_TOUR_KEYS
-- в packages/shared). Аддитивная колонка с дефолтом — существующие пользователи
-- стартуют с пустым набором и увидят туры по одному разу.
ALTER TABLE "User" ADD COLUMN "onboardingToursCompleted" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

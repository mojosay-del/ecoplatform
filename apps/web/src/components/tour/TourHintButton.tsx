"use client";

import { HelpCircle } from "lucide-react";
import type { OnboardingTourKey } from "@ecoplatform/shared";
import { useTours } from "./TourProvider";

// «?» у заголовка раздела — повторный запуск ознакомительной инструкции.
// Визуальный близнец кнопки-подсказки площадки (.mp-auction-info-btn).
export function TourHintButton({
  tour,
  label = "Показать инструкцию по разделу",
}: {
  tour: OnboardingTourKey;
  label?: string;
}) {
  const { startTour } = useTours();

  return (
    <button aria-label={label} className="tour-hint-btn" onClick={() => startTour(tour)} title={label} type="button">
      <HelpCircle aria-hidden="true" size={16} />
    </button>
  );
}

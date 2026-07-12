"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OnboardingTourKey } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { tourDefinitions } from "./definitions";
import {
  isCookieBannerVisible,
  presentTourAnchors,
  tourDelay,
  waitForCondition,
  waitForRunnableSteps,
} from "./tour-dom";
import { resolveAutoTour, selectRunnableSteps } from "./tour-logic";
import { TourOverlay } from "./TourOverlay";
import type { TourMode, TourStep } from "./tour-types";
import "./tour.css";

// Управление сайдбаром на время «навигационных» шагов — реализует AppShell:
// на мобильном открывается drawer, на десктопе разворачивается свёрнутое меню
// (транзиентно, выбор пользователя в localStorage не трогаем).
export type TourNavControls = {
  setNavSpotlight: (active: boolean) => void;
  endNavSpotlight: () => void;
};

type ActiveTour = {
  key: OnboardingTourKey;
  steps: TourStep[];
  mode: TourMode;
  pathname: string;
};

type TourContextValue = {
  activeTourKey: OnboardingTourKey | null;
  // Ручной запуск с «?» у заголовка раздела. Прохождение не переотмечается.
  startTour: (key: OnboardingTourKey) => void;
  stopTour: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTours(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTours must be used inside TourProvider");
  }
  return context;
}

// Пауза перед автозапуском: даём странице дорисовать entry-анимации; она же —
// передышка между платформенным туром и туром страницы при их сцепке.
const AUTO_START_DELAY_MS = 500;

export function TourProvider({
  blocked,
  navControls,
  children,
}: {
  // Блокирующий UI (гейт подписки, «Раздел недоступен») — туры не запускаются.
  blocked: boolean;
  navControls: TourNavControls;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, applyUser } = useAuth();
  const [active, setActive] = useState<ActiveTour | null>(null);
  // Оптимистичные отметки текущей сессии: тур не перезапустится, даже если
  // POST ещё в полёте или упал (тогда просто повторится в следующей сессии).
  const [sessionCompleted, setSessionCompleted] = useState<ReadonlySet<string>>(() => new Set());

  const activeRef = useRef<ActiveTour | null>(null);
  activeRef.current = active;

  const markCompleted = useCallback(
    (key: OnboardingTourKey) => {
      setSessionCompleted((previous) => {
        const next = new Set(previous);
        next.add(key);
        return next;
      });
      void api.account
        .completeOnboardingTour(key)
        .then(applyUser)
        .catch(() => undefined);
    },
    [applyUser],
  );

  // Любое закрытие авто-тура (Готово, Пропустить, крестик, Esc, уход со
  // страницы) фиксирует прохождение навсегда — по требованию продукта.
  const dismissActive = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    navControls.endNavSpotlight();
    setActive(null);
    if (current.mode === "auto") markCompleted(current.key);
  }, [markCompleted, navControls]);

  useEffect(() => {
    const current = activeRef.current;
    if (current && current.pathname !== pathname) dismissActive();
  }, [dismissActive, pathname]);

  // Автозапуск pending-тура: ждём закрытия cookie-баннера (он выше тура),
  // затем готовности обязательных якорей — и стартуем.
  useEffect(() => {
    if (active || blocked) return;
    const key = resolveAutoTour({ pathname, user, sessionCompleted });
    if (!key) return;
    const definition = tourDefinitions[key];

    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      const consentSettled = await waitForCondition(() => !isCookieBannerVisible(), { signal, intervalMs: 300 });
      if (!consentSettled || signal.aborted) return;

      const steps = await waitForRunnableSteps(definition.steps, { signal });
      if (!steps || signal.aborted) return;

      await tourDelay(AUTO_START_DELAY_MS, signal);
      if (signal.aborted) return;

      setActive({ key, steps, mode: "auto", pathname });
    })();

    return () => controller.abort();
  }, [active, blocked, pathname, sessionCompleted, user]);

  const startTour = useCallback(
    (key: OnboardingTourKey) => {
      if (activeRef.current) return;
      const definition = tourDefinitions[key];

      const immediate = selectRunnableSteps(definition.steps, presentTourAnchors(definition.steps));
      if (immediate) {
        setActive({ key, steps: immediate, mode: "manual", pathname });
        return;
      }
      // Контент ещё догружается — короткое ожидание якорей.
      void waitForRunnableSteps(definition.steps, { timeoutMs: 2500 }).then((steps) => {
        if (steps && !activeRef.current) setActive({ key, steps, mode: "manual", pathname });
      });
    },
    [pathname],
  );

  const value = useMemo<TourContextValue>(
    () => ({ activeTourKey: active?.key ?? null, startTour, stopTour: dismissActive }),
    [active?.key, dismissActive, startTour],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active ? (
        <TourOverlay onDismiss={dismissActive} onStepNavChange={navControls.setNavSpotlight} steps={active.steps} />
      ) : null}
    </TourContext.Provider>
  );
}

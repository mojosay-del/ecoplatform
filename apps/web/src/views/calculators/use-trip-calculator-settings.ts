"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tripCalculatorSettingsSchema, type TripCalculatorSettings } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { defaultSettings } from "./defaults";

export type SettingsState = "loading" | "ready" | "unauthenticated" | "forbidden";

const CACHE_KEY = "eco_trip_calculator_settings";
const SAVE_DEBOUNCE_MS = 700;

function readCache(): TripCalculatorSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = tripCalculatorSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(settings: TripCalculatorSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Приватный режим / нет места — кэш необязателен, сервер остаётся истиной.
  }
}

// Настройки калькулятора: сервер — источник правды (общие на компанию),
// localStorage — мгновенная отрисовка и офлайн-фолбэк. Правки автосохраняются
// с дебаунсом. Транзиентные поля заявки (вес/расстояние/материал) тут НЕ живут.
export function useTripCalculatorSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<TripCalculatorSettings>(defaultSettings);
  const [state, setState] = useState<SettingsState>("loading");
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    hydrated.current = false;

    // Сначала кэш — мгновенный экран до ответа сервера (в эффекте, а не в
    // инициализаторе useState, чтобы не ловить hydration mismatch на SSR).
    const cached = readCache();
    if (cached) setSettings(cached);

    api.tripCalculator
      .getSettings()
      .then((server) => {
        if (!active) return;
        if (server) {
          setSettings(server);
          writeCache(server);
        }
        hydrated.current = true;
        setState("ready");
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setState("forbidden");
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          setState("unauthenticated");
          return;
        }
        // Сеть недоступна — продолжаем на кэше/дефолтах: калькулятор офлайн-годен.
        hydrated.current = true;
        setState("ready");
      });

    return () => {
      active = false;
    };
  }, [token]);

  const update = useCallback(
    (updater: (prev: TripCalculatorSettings) => TripCalculatorSettings) => {
      setSettings((prev) => {
        const next = updater(prev);
        writeCache(next);
        if (hydrated.current && token) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            // Молча: значение уже в localStorage, повторим при следующей правке.
            api.tripCalculator.saveSettings(next).catch(() => {});
          }, SAVE_DEBOUNCE_MS);
        }
        return next;
      });
    },
    [token],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  return { settings, update, state };
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import "./cookie-consent.css";

// Версия флага в localStorage. При смене политики/набора категорий — повышаем,
// чтобы старые согласия не считались валидными и баннер показался снова.
const COOKIE_CONSENT_STORAGE_KEY = "eco_cookie_consent_v1";

type CookieChoice = {
  necessary: true; // всегда true — без cookie сессии работать не могут
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
};

declare global {
  interface Window {
    __ANALYTICS_ENABLED__?: boolean;
    __MARKETING_ENABLED__?: boolean;
  }
}

function readChoice(): CookieChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieChoice>;
    if (typeof parsed.acceptedAt !== "string") return null;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      acceptedAt: parsed.acceptedAt,
    };
  } catch {
    return null;
  }
}

function applyChoice(choice: CookieChoice): void {
  if (typeof window === "undefined") return;
  window.__ANALYTICS_ENABLED__ = choice.analytics;
  window.__MARKETING_ENABLED__ = choice.marketing;
}

// Получает id активной cookie-версии — нужен для POST /legal/consents
// от лица авторизованного пользователя. Если бэк недоступен, фронт всё
// равно сохранит выбор в localStorage (бизнес-логика клиентских cookies
// от этого не зависит).
async function fetchCookieDocumentIds(includeMarketing: boolean): Promise<string[]> {
  try {
    const types: ("cookie_policy" | "marketing_consent")[] = ["cookie_policy"];
    if (includeMarketing) types.push("marketing_consent");
    const docs = await api.legal.list(types);
    return docs.map((d) => d.id);
  } catch {
    return [];
  }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const choice = readChoice();
    if (choice) {
      applyChoice(choice);
      return;
    }
    setOpen(true);
  }, []);

  // Пока баннер открыт — публикуем его высоту в CSS-переменную, чтобы страницы
  // могли зарезервировать место снизу и баннер не перекрывал контент
  // (на мобильном раньше прятал кнопку «Войти»). Высота пересчитывается при
  // переносе кнопок/ресайзе.
  useEffect(() => {
    const root = document.documentElement;
    if (!open || !bannerRef.current) {
      root.style.setProperty("--cookie-banner-height", "0px");
      return;
    }
    const el = bannerRef.current;
    const update = () => root.style.setProperty("--cookie-banner-height", `${el.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      root.style.setProperty("--cookie-banner-height", "0px");
    };
  }, [open, showCustom]);

  function persist(choice: CookieChoice) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(choice));
      } catch {
        // private/Safari/quota — игнорим, важнее не падать
      }
    }
    applyChoice(choice);
    setOpen(false);
  }

  async function handleAcceptAll() {
    const choice: CookieChoice = {
      necessary: true,
      analytics: true,
      marketing: true,
      acceptedAt: new Date().toISOString(),
    };
    const documentIds = await fetchCookieDocumentIds(true);
    if (documentIds.length) {
      api.legal.submitConsents(documentIds, "cookie_banner").catch(() => undefined);
    }
    persist(choice);
  }

  async function handleNecessaryOnly() {
    const choice: CookieChoice = {
      necessary: true,
      analytics: false,
      marketing: false,
      acceptedAt: new Date().toISOString(),
    };
    persist(choice);
  }

  async function handleCustomSubmit() {
    const choice: CookieChoice = {
      necessary: true,
      analytics,
      marketing,
      acceptedAt: new Date().toISOString(),
    };
    const documentIds = await fetchCookieDocumentIds(marketing);
    if (documentIds.length) {
      api.legal.submitConsents(documentIds, "cookie_banner").catch(() => undefined);
    }
    persist(choice);
  }

  if (!open) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-labelledby="cookie-banner-title" ref={bannerRef}>
      <div className="cookie-banner-inner">
        <div className="cookie-banner-text">
          <strong id="cookie-banner-title">Мы используем cookies</strong>
          <p>
            Чтобы платформа работала и мы понимали, как её улучшать. Подробности —{" "}
            <Link href="/legal/cookies" target="_blank">
              в Политике cookies
            </Link>
            .
          </p>
        </div>
        {showCustom ? (
          <div className="cookie-banner-custom">
            <label className="cookie-banner-option">
              <input type="checkbox" checked disabled aria-label="Необходимые cookies (всегда включены)" />
              <span>
                <strong>Необходимые</strong>
                <span>Без них вход и кабинет работать не будут.</span>
              </span>
            </label>
            <label className="cookie-banner-option">
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              <span>
                <strong>Аналитика</strong>
                <span>Анонимная статистика посещаемости.</span>
              </span>
            </label>
            <label className="cookie-banner-option">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>
                <strong>Маркетинг</strong>
                <span>Для будущих рассылок и таргетинга.</span>
              </span>
            </label>
            <div className="cookie-banner-actions">
              <button type="button" className="button button-primary" onClick={handleCustomSubmit}>
                Сохранить
              </button>
              <button type="button" className="button" onClick={() => setShowCustom(false)}>
                Назад
              </button>
            </div>
          </div>
        ) : (
          <div className="cookie-banner-actions">
            <button type="button" className="button button-primary" onClick={handleAcceptAll}>
              Принять все
            </button>
            <button type="button" className="button" onClick={handleNecessaryOnly}>
              Только необходимые
            </button>
            <button type="button" className="button-link" onClick={() => setShowCustom(true)}>
              Настроить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

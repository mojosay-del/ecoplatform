"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";

/*
 * Клиентский «островок» презентационной страницы. Сама страница серверная —
 * здесь только то, что нельзя сделать на CSS:
 *   1. авто-редирект уже залогиненного пользователя в кабинет (/news);
 *   2. появление блоков по скроллу (IntersectionObserver);
 *   3. счётчики-«count-up» у метрик;
 *   4. прогресс-бар, параллакс и «пиннинг» горизонтальной ленты (rAF на скролл).
 * Всё «двигательное» отключается при prefers-reduced-motion.
 */
export function LandingClient() {
  const router = useRouter();
  const { user, ready } = useAuth();

  // 1. Залогиненного посетителя сразу уводим в кабинет — лендинг только для гостей.
  useEffect(() => {
    if (ready && user) {
      router.replace("/news");
    }
  }, [ready, user, router]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // 2. Reveal по скроллу.
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    revealEls.forEach((el) => revealObserver.observe(el));

    // 3. Счётчики метрик.
    const fmt = new Intl.NumberFormat("ru-RU");
    const countEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-count]"),
    );
    const runCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count ?? "0");
      const suffix = el.dataset.suffix ?? "";
      const duration = 1500;
      // Мутируем значение существующего текстового узла, а не textContent —
      // иначе мы заменяем узел, которым владеет React, и в dev (StrictMode)
      // при размонтировании ловим NotFoundError: removeChild.
      const setText = (value: string) => {
        const node = el.firstChild;
        if (node && node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = value;
        } else {
          el.textContent = value;
        }
      };
      if (reduceMotion) {
        setText(fmt.format(target) + suffix);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setText(fmt.format(Math.round(target * eased)) + suffix);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            runCount(entry.target as HTMLElement);
            countObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.6 },
    );
    countEls.forEach((el) => countObserver.observe(el));

    // 4. Скролл-движок: прогресс-бар, параллакс превью, горизонтальная лента.
    const bar = document.querySelector<HTMLElement>(".lp-progress__bar");
    const preview = document.querySelector<HTMLElement>("[data-parallax]");
    const horizontal =
      document.querySelector<HTMLElement>(".lp-horizontal");
    const track = horizontal?.querySelector<HTMLElement>(
      ".lp-horizontal__track",
    );

    // 3D-наклон плашек: поворачиваем их по оси X в зависимости от положения
    // в окне — создаёт ощущение объёма и лёгкого вращения при скролле.
    const tiltEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-tilt]"),
    );

    // Включаем «пиннинг» ленты только на широких экранах и без reduced-motion.
    // canPin пересчитываем при каждом layout — чтобы корректно реагировать на
    // ресайз и поворот экрана (десктоп ⇄ мобайл).
    let canPin = false;
    let maxTranslate = 0;

    const layoutHorizontal = () => {
      if (!horizontal || !track) return;
      canPin = !reduceMotion && window.innerWidth >= 980;
      if (!canPin) {
        horizontal.classList.remove("is-pinned");
        horizontal.style.removeProperty("height");
        track.style.removeProperty("transform");
        return;
      }
      horizontal.classList.add("is-pinned");
      maxTranslate = Math.max(0, track.scrollWidth - window.innerWidth);
      horizontal.style.height = `${window.innerHeight + maxTranslate}px`;
    };
    layoutHorizontal();

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const scrollY = window.scrollY;
        const docH =
          document.documentElement.scrollHeight - window.innerHeight;

        if (bar) {
          const p = docH > 0 ? Math.min(scrollY / docH, 1) : 0;
          bar.style.transform = `scaleX(${p})`;
        }

        if (preview && !reduceMotion) {
          preview.style.transform = `translateY(${Math.min(scrollY * 0.05, 70)}px)`;
        }

        if (canPin && horizontal && track && maxTranslate > 0) {
          const rect = horizontal.getBoundingClientRect();
          const span = horizontal.offsetHeight - window.innerHeight;
          const progress =
            span > 0 ? Math.min(Math.max(-rect.top / span, 0), 1) : 0;
          track.style.transform = `translateX(${-progress * maxTranslate}px)`;
        }

        if (!reduceMotion && tiltEls.length && window.innerWidth >= 980) {
          const vh = window.innerHeight;
          for (const el of tiltEls) {
            const r = el.getBoundingClientRect();
            if (r.bottom < -100 || r.top > vh + 100) continue;
            const center = r.top + r.height / 2;
            const rel = (center - vh / 2) / vh; // ≈ -0.5..0.5
            const rotX = Math.max(-6, Math.min(6, -rel * 11));
            el.style.transform = `perspective(1600px) rotateX(${rotX.toFixed(2)}deg)`;
          }
        }
      });
    };

    const onResize = () => {
      layoutHorizontal();
      onScroll();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();

    return () => {
      revealObserver.disconnect();
      countObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

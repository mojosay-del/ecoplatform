"use client";

import { useEffect, useState } from "react";

// Общий scroll-spy для липких лент-указателей (каталог сырья, реестр документов).
// Раньше активная секция выбиралась по КЭШУ `entry.boundingClientRect.top`,
// снятому в момент пересечения границы IntersectionObserver — снимки с разных
// позиций сортировались между собой и давали «залипание»/перескок категории
// (пропуск второго пункта при быстрой прокрутке вниз). Здесь на каждом кадре
// прокрутки читаем СВЕЖИЕ позиции всех секций и берём последнюю, чей верх уже
// поднялся под липкий топбар (offset). Плюс явная обработка самого низа страницы.
export function useScrollSpy(slugs: string[], dataAttr: string, offset = 96): string | null {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const slugsKey = slugs.join(",");

  useEffect(() => {
    const ids = slugsKey ? slugsKey.split(",") : [];
    if (ids.length === 0) return;

    let frame = 0;

    const compute = () => {
      frame = 0;
      const elements = ids
        .map((slug) => document.querySelector<HTMLElement>(`[${dataAttr}="${CSS.escape(slug)}"]`))
        .filter((element): element is HTMLElement => element !== null);
      if (elements.length === 0) return;

      // Докрутили до самого низа — последняя секция активна (её верх может быть
      // ниже offset-линии, но проскроллить дальше уже некуда).
      const scrollBottom = window.scrollY + window.innerHeight;
      if (document.documentElement.scrollHeight - scrollBottom <= 2) {
        const lastSlug = elements[elements.length - 1]!.getAttribute(dataAttr);
        if (lastSlug) setActiveSlug(lastSlug);
        return;
      }

      // Иначе — последняя секция, чей верх уже поднялся под липкий топбар.
      let current = elements[0]!.getAttribute(dataAttr);
      for (const element of elements) {
        if (element.getBoundingClientRect().top - offset <= 1) {
          current = element.getAttribute(dataAttr);
        } else {
          break;
        }
      }
      if (current) setActiveSlug(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [slugsKey, dataAttr, offset]);

  return activeSlug;
}

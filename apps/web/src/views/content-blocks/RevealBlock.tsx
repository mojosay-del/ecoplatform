"use client";

// Появление блока «из воздуха» при попадании в зону видимости (скролл вниз).
// Используется в уроках обучения и статьях базы знаний: после скелетона элементы
// проявляются постепенно. Уважает prefers-reduced-motion и окружения без
// IntersectionObserver (SSR/старые браузеры) — там блок виден сразу.

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./reveal-block.css";

export function RevealBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal-block${revealed ? " is-revealed" : ""}`}>
      {children}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Factory, Forklift, Package, RussianRuble, Truck } from "lucide-react";
import type { AuthIcon, AuthMode } from "./types";
import "./auth-shell.css";

const AUTH_ICONS: AuthIcon[] = [
  {
    key: "factory",
    hold: 1500,
    caption: "Переработка",
    node: <Factory aria-hidden="true" />,
  },
  {
    key: "forklift",
    hold: 1500,
    caption: "Склад и отгрузка",
    node: <Forklift aria-hidden="true" />,
  },
  {
    key: "bale",
    hold: 1500,
    caption: "Партии вторсырья",
    node: <Package aria-hidden="true" />,
  },
  {
    key: "truck",
    hold: 1500,
    caption: "Логистика",
    node: <Truck aria-hidden="true" />,
  },
  {
    key: "ruble",
    hold: 1500,
    caption: "Прозрачная цена",
    node: <RussianRuble aria-hidden="true" />,
  },
  {
    key: "logo",
    hold: 4000,
    caption: "Всё в одном месте",
    node: (
      <svg viewBox="0 0 1024 1024" aria-hidden="true">
        <path
          d="M 771 289 L 706 303 L 525 312 L 467 330 L 423 358 L 392 390 L 363 438 L 336 554 L 376 483 L 446 422 L 534 384 L 635 366 L 518 407 L 422 469 L 359 548 L 300 684 L 566 684 L 603 672 L 639 604 L 438 604 L 450 569 L 641 559 L 662 543 L 693 476 L 486 502 L 424 520 L 380 544 L 435 505 L 579 470 L 652 438 L 728 368 Z M 634 365 L 635 364 L 638 364 L 639 365 L 638 366 L 635 366 Z"
          fillRule="evenodd"
        />
      </svg>
    ),
  },
];

function AuthVisual({ mode }: { mode: AuthMode }) {
  const [index, setIndex] = useState(0);
  const current = AUTH_ICONS[index] ?? AUTH_ICONS[0]!;

  useEffect(() => {
    const id = window.setTimeout(() => setIndex((prev) => (prev + 1) % AUTH_ICONS.length), current.hold);
    return () => window.clearTimeout(id);
  }, [current.key, current.hold]);

  return (
    <section className="auth-visual" data-mode={mode} aria-hidden="true">
      <div className="auth-visual-aurora" />
      <div className="auth-visual-wordmark">ЭкоПлатформа</div>
      <div className="auth-visual-hero">
        <div className="auth-visual-tile">
          <span className={`auth-visual-tile-icon${current.key === "logo" ? " is-logo" : ""}`} key={current.key}>
            {current.node}
          </span>
        </div>

        <h2 className="auth-visual-title">Рынок вторсырья, каким он должен быть: прозрачным, понятным и удобным.</h2>
      </div>
    </section>
  );
}

export function AuthShell({ children, mode }: { children: ReactNode; mode: AuthMode }) {
  return (
    <main className="auth-page" id="main-content" tabIndex={-1}>
      <div className="auth-layout">
        <AuthVisual mode={mode} />
        <div className="auth-form-panel">
          <div className="auth-mobile-brand" aria-hidden="true">
            <Image className="auth-mobile-brand-logo" src="/icons/icon-192.png" alt="" width={36} height={36} />
            <span>ЭкоПлатформа</span>
          </div>
          {children}
          <footer className="page-footer">
            <Link href="/legal/privacy">Конфиденциальность</Link>
            <Link href="/legal/terms">Соглашение</Link>
            <Link href="/legal/personal-data">152-ФЗ</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/legal/offer">Оферта</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

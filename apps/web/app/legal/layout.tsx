import Link from "next/link";
import type { ReactNode } from "react";

// Публичный layout для /legal/* страниц: без AppShell-сайдбара, без auth.
// Простой контейнер с шапкой логотипа и контентом по центру — пользователь
// может попасть сюда из cookie-banner, чекбоксов регистрации или футера.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="legal-shell" id="main-content" tabIndex={-1}>
      <header className="legal-shell-head">
        <Link href="/" className="legal-shell-brand">
          ЭкоПлатформа
        </Link>
        <nav className="legal-shell-nav" aria-label="Навигация юридических страниц">
          <Link href="/login">Войти</Link>
          <Link href="/register">Регистрация</Link>
        </nav>
      </header>
      <article className="legal-shell-content">{children}</article>
      <footer className="legal-shell-foot">
        <span>© 2026 ЭкоПлатформа</span>
        <Link href="/legal/privacy">Конфиденциальность</Link>
        <Link href="/legal/terms">Соглашение</Link>
        <Link href="/legal/personal-data">152-ФЗ</Link>
        <Link href="/legal/cookies">Cookies</Link>
        <Link href="/legal/offer">Оферта</Link>
      </footer>
    </main>
  );
}

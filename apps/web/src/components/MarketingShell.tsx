import Link from "next/link";
import type { ReactNode } from "react";

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Конфиденциальность" },
  { href: "/legal/terms", label: "Соглашение" },
  { href: "/legal/personal-data", label: "152-ФЗ" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/offer", label: "Оферта" },
] as const;

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="marketing-page" id="main-content" tabIndex={-1}>
      <header className="marketing-header">
        <Link className="marketing-wordmark" href="/login">
          ЭкоПлатформа
        </Link>
      </header>
      <section className="marketing-content">{children}</section>
      <footer className="auth-footer marketing-footer">
        {LEGAL_LINKS.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </footer>
    </main>
  );
}

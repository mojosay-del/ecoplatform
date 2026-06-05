import Link from "next/link";
import { SUPPORT_EMAIL } from "../../lib/platform-contact";

// Footer внутри кабинета — даёт постоянный доступ к юридическим документам.
export function AppShellFooter() {
  return (
    <footer className="app-shell-footer">
      <strong>ЭкоПлатформа</strong>
      <span>SaaS для рынка вторсырья</span>
      <span className="app-shell-footer-separator" aria-hidden="true" />
      <nav className="app-shell-footer-links" aria-label="Правовая информация">
        <Link href="/legal/privacy">Политика конфиденциальности</Link>
        <Link href="/legal/terms">Пользовательское соглашение</Link>
        <Link href="/legal/personal-data">Согласие на обработку ПДн</Link>
        <Link href="/legal/cookies">Cookies</Link>
        <Link href="/legal/offer">Оферта</Link>
      </nav>
      <span className="app-shell-footer-separator" aria-hidden="true" />
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      <span className="app-shell-footer-copyright">© 2026</span>
    </footer>
  );
}

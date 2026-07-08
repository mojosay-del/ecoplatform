import Link from "next/link";
import { PLATFORM_LEGAL, SUPPORT_EMAIL } from "../../lib/platform-contact";

// Разделы платформы — дублируют ключевые пункты меню (href из app-shell-nav).
const PRODUCT_LINKS = [
  { href: "/news", label: "Новости" },
  { href: "/indices", label: "Индексы цен" },
  { href: "/knowledge-base", label: "База знаний" },
  { href: "/documentation", label: "Документация" },
  { href: "/education", label: "Обучение" },
  { href: "/forum", label: "Форум" },
];

const LEGAL_LINKS = [
  { href: "/legal/privacy", label: "Политика конфиденциальности" },
  { href: "/legal/terms", label: "Пользовательское соглашение" },
  { href: "/legal/personal-data", label: "Согласие на обработку ПДн" },
  { href: "/legal/cookies", label: "Политика cookies" },
  { href: "/legal/offer", label: "Публичная оферта" },
];

// Полноценный «российский» бизнес-футер кабинета: колонки навигации/документов/
// контактов + нижняя полоса с реквизитами юрлица и дисклеймером. Реквизиты —
// плейсхолдеры из PLATFORM_LEGAL (заменить перед запуском).
export function AppShellFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-shell-footer">
      <div className="app-shell-footer-grid">
        <div className="app-shell-footer-brand-col">
          <strong>ЭкоПлатформа</strong>
          <p>SaaS для рынка вторсырья: витрина, аналитика цен и торговая площадка в одном месте.</p>
        </div>
        <nav className="app-shell-footer-col" aria-label="Разделы платформы">
          <span className="app-shell-footer-col-title">Разделы</span>
          {PRODUCT_LINKS.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <nav className="app-shell-footer-col" aria-label="Правовая информация">
          <span className="app-shell-footer-col-title">Документы</span>
          {LEGAL_LINKS.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="app-shell-footer-col">
          <span className="app-shell-footer-col-title">Контакты</span>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <span>{PLATFORM_LEGAL.phone}</span>
          <span className="app-shell-footer-muted">{PLATFORM_LEGAL.workingHours}</span>
        </div>
      </div>
      <div className="app-shell-footer-bottom">
        <div className="app-shell-footer-requisites">
          <span>{PLATFORM_LEGAL.legalEntity}</span>
          <span>{PLATFORM_LEGAL.inn}</span>
          <span>{PLATFORM_LEGAL.ogrn}</span>
          <span>{PLATFORM_LEGAL.legalAddress}</span>
        </div>
        <p className="app-shell-footer-disclaimer">
          Информация на сайте носит справочный характер и не является публичной офертой. © {year} ЭкоПлатформа.
        </p>
      </div>
    </footer>
  );
}

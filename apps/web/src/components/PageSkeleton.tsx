// Каркас страницы для Next.js loading.tsx. Рисует тот же app-shell, что и
// защищённые страницы, чтобы при переходах не было скачка из полноэкранного
// skeleton в layout с сайдбаром и топбаром.
//
// Использовать как `<PageSkeleton title="Новости" variant="grid" />`.
// Server component — никакого client-state, иначе теряется смысл (skeleton
// должен мгновенно вернуться из SSR).

import type { ReactNode } from "react";

type SkeletonVariant = "list" | "grid" | "article" | "form";

export function PageSkeleton({
  title,
  subtitle,
  variant = "list",
}: {
  title: string;
  subtitle?: string;
  variant?: SkeletonVariant;
}) {
  return (
    <div className="app-shell app-shell-loading" data-collapsed="false">
      <aside className="sidebar app-shell-loading-sidebar" aria-hidden="true">
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-mark">
              <img alt="" height="32" src="/brand/logo.webp" width="32" />
            </span>
            <span className="brand-text">ЭкоПлатформа</span>
          </div>
        </div>
        {[
          { title: "Рынок", itemCount: 2 },
          { title: "Базы знаний", itemCount: 3 },
          { title: "Инструменты", itemCount: 5 },
          { title: "Сообщество", itemCount: 1 },
        ].map((section) => (
          <nav className="nav-section" key={section.title}>
            <p className="nav-title">{section.title}</p>
            {Array.from({ length: section.itemCount }).map((_, itemIndex) => (
              <div className="nav-link app-shell-loading-nav-link" key={itemIndex}>
                <span className="app-shell-loading-icon" />
                <span className="app-shell-loading-line" />
              </div>
            ))}
          </nav>
        ))}
      </aside>
      <main className="main" id="main-content" tabIndex={-1} aria-busy="true" aria-live="polite">
        <header className="topbar app-shell-loading-topbar" aria-hidden="true">
          <span className="app-shell-loading-menu" />
          <span className="app-shell-loading-breadcrumb" />
          <div className="topbar-spacer" />
          <span className="app-shell-loading-pill" />
          <span className="app-shell-loading-avatar" />
        </header>
        <div className="page-surface">
          <section className="page page-skeleton">
            <header className="page-skeleton-header">
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </header>
            <div className={`page-skeleton-body page-skeleton-${variant}`}>{renderBody(variant)}</div>
          </section>
        </div>
      </main>
      <footer className="app-shell-footer app-shell-loading-footer" aria-hidden="true">
        <strong>ЭкоПлатформа</strong>
        <span className="app-shell-footer-separator" />
        <span className="app-shell-loading-footer-line" />
      </footer>
    </div>
  );
}

function renderBody(variant: SkeletonVariant): ReactNode {
  switch (variant) {
    case "grid":
      return (
        <div className="page-skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="page-skeleton-card" />
          ))}
        </div>
      );
    case "article":
      return (
        <>
          <div className="page-skeleton-bar w-3-4" />
          <div className="page-skeleton-bar w-2-3" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-1-2" />
        </>
      );
    case "form":
      return (
        <>
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-1-2" />
        </>
      );
    case "list":
    default:
      return Array.from({ length: 4 }).map((_, i) => <div key={i} className="page-skeleton-row" />);
  }
}

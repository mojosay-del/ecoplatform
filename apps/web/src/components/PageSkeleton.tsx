// Каркас страницы для Next.js loading.tsx. Рисует структуру с приглушёнными
// блоками: пользователь сразу видит, что страница «грузится», а не пустой
// экран. После загрузки чанка/данных React-дерево моментально подменяется.
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
    <main className="page-skeleton" id="main-content" tabIndex={-1} aria-busy="true" aria-live="polite">
      <header className="page-skeleton-header">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className={`page-skeleton-body page-skeleton-${variant}`}>{renderBody(variant)}</div>
    </main>
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

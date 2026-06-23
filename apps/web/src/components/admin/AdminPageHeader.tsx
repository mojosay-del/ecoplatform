import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Опциональный счётчик-чип рядом с заголовком (например, число записей). */
  count?: ReactNode;
  /** Кнопки/действия, прижатые к правому краю. */
  actions?: ReactNode;
};

/**
 * Единый заголовок страниц панели управления: заголовок + подзаголовок,
 * опциональный счётчик-чип и слот действий справа. Заменяет повторяющийся
 * `<header className="page-header">…` во всех admin-вьюхах.
 */
export function AdminPageHeader({ title, subtitle, count, actions }: AdminPageHeaderProps) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header-text">
        <div className="admin-page-header-titlerow">
          <h1 className="page-title">{title}</h1>
          {count != null ? <span className="admin-page-header-count">{count}</span> : null}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="admin-page-header-actions">{actions}</div> : null}
    </header>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type AdminEmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Кнопка действия (например, «Очистить фильтры»). */
  action?: ReactNode;
};

/**
 * Единое пустое состояние: иконка-плашка, заголовок, описание и опциональное
 * действие. Расширяет базовый `.admin-empty-state` из admin.css.
 */
export function AdminEmptyState({ icon: Icon, title, description, action }: AdminEmptyStateProps) {
  return (
    <div className="admin-empty-state">
      {Icon ? (
        <span className="admin-empty-state-icon" aria-hidden>
          <Icon size={26} />
        </span>
      ) : null}
      <div className="admin-empty-state-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

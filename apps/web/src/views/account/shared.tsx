import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import type { AccountSectionId } from "../../components/app-shell-nav";
import { accountSectionDomId } from "./dom";

export function accountDash(value: ReactNode) {
  return value || <span className="account-muted">Не заполнено</span>;
}

export function AccountDetailList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="account-detail-list">
      {rows.map((row) => (
        <div className="account-detail-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{accountDash(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AccountEditableValue({
  value,
  label,
  onEdit,
}: {
  value?: string | null;
  label: string;
  onEdit?: () => void;
}) {
  return (
    <span className="account-editable-value">
      <span>{accountDash(value)}</span>
      <button
        aria-label={onEdit ? `Редактировать поле ${label}` : `Редактирование поля ${label} появится позже`}
        className="account-inline-edit"
        disabled={!onEdit}
        onClick={onEdit}
        title={onEdit ? `Редактировать ${label}` : `Редактирование поля ${label} появится позже`}
        type="button"
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
    </span>
  );
}

export function AccountPasswordValue({ onEdit }: { onEdit: () => void }) {
  return (
    <span className="account-editable-value">
      <span className="account-secret-value" aria-label="Пароль скрыт">
        ••••••••
      </span>
      <button
        aria-label="Открыть смену пароля"
        className="account-inline-edit"
        onClick={onEdit}
        title="Сменить пароль"
        type="button"
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
    </span>
  );
}

export function AccountScrollSection({
  accountSection,
  children,
  description,
  title,
}: {
  accountSection: AccountSectionId;
  children: ReactNode;
  description?: string;
  title?: string;
}) {
  const titleId = title ? `${accountSectionDomId(accountSection)}-title` : undefined;

  return (
    <section
      className="account-scroll-section"
      data-account-section={accountSection}
      id={accountSectionDomId(accountSection)}
      aria-labelledby={titleId}
    >
      {title ? (
        <header className="account-scroll-section-head">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

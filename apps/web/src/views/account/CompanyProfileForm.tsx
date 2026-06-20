import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { X } from "lucide-react";
import type { BillingStatus, CompanyProfileUpdateDto } from "@ecoplatform/shared";
import { errorText, api } from "../../lib/api";
import { COMPANY_FIELD_CONFIG } from "./constants";
import { useAccountDialogBodyLock } from "./hooks";
import { AccountDetailList, AccountEditableValue } from "./shared";
import type { CompanyEditableField, CompanyFormState } from "./types";

function billingToFormState(billing: BillingStatus): CompanyFormState {
  return {
    organizationName: billing.organizationName,
    websiteUrl: billing.websiteUrl ?? "",
    corporatePhone: billing.corporatePhone ?? "",
    corporateEmail: billing.corporateEmail ?? "",
  };
}

export function CompanyProfileForm({
  billing,
  onSaved,
}: {
  billing: BillingStatus;
  onSaved: (updated: BillingStatus) => void;
}) {
  const [form, setForm] = useState<CompanyFormState>(() => billingToFormState(billing));
  const [editingField, setEditingField] = useState<CompanyEditableField | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const activeFieldConfig = editingField ? COMPANY_FIELD_CONFIG[editingField] : null;

  // Если внешние данные billing изменились (например, после успешного сейва) —
  // подтянуть форму, чтобы не редактировать «исторические» значения.
  useEffect(() => {
    setForm(billingToFormState(billing));
  }, [billing]);

  useAccountDialogBodyLock(Boolean(editingField), closeEditDialog, saving);

  function setField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openEditDialog(field: CompanyEditableField) {
    setForm(billingToFormState(billing));
    setMessage(null);
    setEditingField(field);
  }

  function closeEditDialog() {
    if (saving) return;
    setEditingField(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingField) return;

    setMessage(null);
    setSaving(true);
    const trimmedValue = form[editingField].trim();
    const dto: CompanyProfileUpdateDto =
      editingField === "organizationName"
        ? { organizationName: trimmedValue }
        : { [editingField]: trimmedValue || null };
    try {
      const updated = await api.billing.updateCompanyProfile(dto);
      onSaved(updated);
      setMessage({ type: "ok", text: "Сохранено." });
      setEditingField(null);
    } catch (error) {
      setMessage({
        type: "error",
        text: errorText(error, "Не удалось сохранить."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card account-card">
      <h2>Данные компании</h2>
      <AccountDetailList
        rows={[
          {
            label: COMPANY_FIELD_CONFIG.organizationName.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.organizationName}
                label="Название компании"
                onEdit={() => openEditDialog("organizationName")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.websiteUrl.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.websiteUrl}
                label="Сайт компании"
                onEdit={() => openEditDialog("websiteUrl")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.corporatePhone.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.corporatePhone}
                label="Корпоративный телефон"
                onEdit={() => openEditDialog("corporatePhone")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.corporateEmail.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.corporateEmail}
                label="Корпоративный email"
                onEdit={() => openEditDialog("corporateEmail")}
              />
            ),
          },
        ]}
      />
      {message ? <p className={`account-form-message account-form-message-${message.type}`}>{message.text}</p> : null}
      {editingField && activeFieldConfig ? (
        <div
          aria-labelledby="account-company-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Компания</span>
                <h2 id="account-company-dialog-title">{activeFieldConfig.modalTitle}</h2>
                <p>Измените только выбранный пункт.</p>
              </div>
              <button
                aria-label={`Закрыть редактирование: ${activeFieldConfig.modalTitle}`}
                className="account-password-modal-close"
                disabled={saving}
                onClick={closeEditDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="account-form account-password-modal-form" onSubmit={onSubmit}>
              <label>
                <span>{activeFieldConfig.inputLabel}</span>
                <input
                  autoFocus
                  className="input"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setField(editingField, event.target.value)}
                  placeholder={activeFieldConfig.placeholder}
                  required={activeFieldConfig.required}
                  type={activeFieldConfig.type}
                  value={form[editingField]}
                />
              </label>
              {message?.type === "error" ? (
                <p className="account-form-message account-form-message-error">{message.text}</p>
              ) : null}
              <button className="button" type="submit" disabled={saving}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </article>
  );
}

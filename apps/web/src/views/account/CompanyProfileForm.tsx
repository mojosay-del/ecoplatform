import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import type { BillingStatus, CompanyProfileUpdateDto, MarketplaceAddressSuggestion } from "@ecoplatform/shared";
import {
  addressDraftHasSelectedAddress,
  addressDraftToDto,
  addressSuggestionToDraft,
  companyAddressToDraft,
  emptyAddressDraft,
  type AddressCountryCode,
  type AddressDraft,
} from "../../lib/company-address";
import { PhoneInput } from "../../components/auth/phone-input";
import type { PhoneCountryId } from "../../components/auth/types";
import { formatPhoneFull, getPhoneCountry } from "../../components/auth/utils";
import { errorText, api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { COMPANY_FIELD_CONFIG } from "./constants";
import { useAccountDialogBodyLock } from "./hooks";
import { phoneStateFromValue } from "./personal-profile-utils";
import { AccountDetailList, AccountEditableValue } from "./shared";
import type { CompanyEditableField, CompanyFormState } from "./types";

const COMPANY_ADDRESS_SEARCH_ID = "account-company-address-search";
const COMPANY_ADDRESS_SUGGESTIONS_ID = "account-company-address-suggestions";
const ADDRESS_SUGGEST_MIN_LENGTH = 3;
const ADDRESS_SUGGEST_DEBOUNCE_MS = 300;
type AddressSuggestState = "idle" | "loading" | "open" | "empty" | "failed";

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
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyFormState>(() => billingToFormState(billing));
  const [editingField, setEditingField] = useState<CompanyEditableField | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  // Телефон компании редактируется тем же PhoneInput, что и в регистрации/личных
  // данных (страна + маска), но без подтверждения по почте — сохраняется сразу.
  const [phoneCountryId, setPhoneCountryId] = useState<PhoneCountryId>("ru");
  const [phoneDigits, setPhoneDigits] = useState("");
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
    if (field === "corporatePhone") {
      const phone = phoneStateFromValue(billing.corporatePhone ?? "");
      setPhoneCountryId(phone.countryId);
      setPhoneDigits(phone.digits);
    }
    setEditingField(field);
  }

  function closeEditDialog() {
    if (saving) return;
    setEditingField(null);
  }

  function handleSaved(updated: BillingStatus, text = "Сохранено.") {
    queryClient.setQueryData(queryKeys.billing.status(), updated);
    queryClient.setQueryData(["api", "billing-status"], updated);
    onSaved(updated);
    setMessage({ type: "ok", text });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingField) return;

    setMessage(null);

    let dto: CompanyProfileUpdateDto;
    if (editingField === "corporatePhone") {
      if (phoneDigits.length === 0) {
        dto = { corporatePhone: null };
      } else {
        const fullPhone = formatPhoneFull(getPhoneCountry(phoneCountryId), phoneDigits);
        if (!fullPhone) {
          setMessage({ type: "error", text: "Введите полный номер телефона." });
          return;
        }
        dto = { corporatePhone: fullPhone };
      }
    } else {
      const trimmedValue = form[editingField].trim();
      dto =
        editingField === "organizationName"
          ? { organizationName: trimmedValue }
          : { [editingField]: trimmedValue || null };
    }

    setSaving(true);
    try {
      const updated = await api.billing.updateCompanyProfile(dto);
      handleSaved(updated);
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
          {
            label: "Адрес",
            value: (
              <AccountEditableValue
                value={billing.factualAddress?.formatted}
                label="Адрес компании"
                onEdit={() => {
                  setMessage(null);
                  setAddressDialogOpen(true);
                }}
              />
            ),
          },
        ]}
      />
      {message ? <p className={`account-form-message account-form-message-${message.type}`}>{message.text}</p> : null}
      {editingField && activeFieldConfig ? (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
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
              {editingField === "corporatePhone" ? (
                <label>
                  <span>{activeFieldConfig.inputLabel}</span>
                  <PhoneInput
                    name="corporatePhone"
                    countryId={phoneCountryId}
                    digits={phoneDigits}
                    onCountryChange={setPhoneCountryId}
                    onDigitsChange={setPhoneDigits}
                  />
                </label>
              ) : (
                <label>
                  <span>{activeFieldConfig.inputLabel}</span>
                  {/* eslint-disable jsx-a11y/no-autofocus -- автофокус первого поля переносит фокус в модалку при открытии (корректно для диалога) */}
                  <input
                    autoFocus
                    className="input"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setField(editingField, event.target.value)}
                    placeholder={activeFieldConfig.placeholder}
                    required={activeFieldConfig.required}
                    type={activeFieldConfig.type}
                    value={form[editingField]}
                  />
                  {/* eslint-enable jsx-a11y/no-autofocus */}
                </label>
              )}
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
      {addressDialogOpen ? (
        <CompanyAddressDialog
          address={billing.factualAddress}
          onClose={() => setAddressDialogOpen(false)}
          onSaved={(updated) => {
            handleSaved(updated, "Адрес сохранён.");
            setAddressDialogOpen(false);
          }}
        />
      ) : null}
    </article>
  );
}

function CompanyAddressDialog({
  address,
  onClose,
  onSaved,
}: {
  address: BillingStatus["factualAddress"];
  onClose: () => void;
  onSaved: (updated: BillingStatus) => void;
}) {
  const [draft, setDraft] = useState<AddressDraft>(() => companyAddressToDraft(address));
  const [suggestions, setSuggestions] = useState<MarketplaceAddressSuggestion[]>([]);
  const [suggestState, setSuggestState] = useState<AddressSuggestState>("idle");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestRef = useRef(0);
  const selected = addressDraftHasSelectedAddress(draft);

  useAccountDialogBodyLock(true, closeDialog, saving);

  useEffect(() => {
    setDraft(companyAddressToDraft(address));
    setSuggestions([]);
    setSuggestState("idle");
    setMessage(null);
  }, [address]);

  useEffect(() => {
    const query = draft.query.trim();
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (selected) {
      setSuggestions([]);
      setSuggestState("idle");
      return;
    }

    if (query.length < ADDRESS_SUGGEST_MIN_LENGTH) {
      setSuggestions([]);
      setSuggestState("idle");
      return;
    }

    let cancelled = false;
    setSuggestState("loading");
    const timer = window.setTimeout(() => {
      api.geo
        .addressSuggest(query, draft.countryCode)
        .then((nextSuggestions) => {
          if (cancelled || requestRef.current !== requestId) return;
          setSuggestions(nextSuggestions);
          setSuggestState(nextSuggestions.length > 0 ? "open" : "empty");
        })
        .catch(() => {
          if (cancelled || requestRef.current !== requestId) return;
          setSuggestions([]);
          setSuggestState("failed");
        });
    }, ADDRESS_SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.query, draft.countryCode, selected]);

  function closeDialog() {
    if (saving) return;
    onClose();
  }

  function selectCountry(countryCode: AddressCountryCode) {
    setDraft(emptyAddressDraft(countryCode));
    setSuggestions([]);
    setSuggestState("idle");
    setMessage(null);
  }

  function changeQuery(value: string) {
    setDraft((current) => ({ ...emptyAddressDraft(current.countryCode), query: value }));
    setMessage(null);
  }

  function selectSuggestion(suggestion: MarketplaceAddressSuggestion) {
    setDraft(addressSuggestionToDraft(suggestion));
    setSuggestions([]);
    setSuggestState("idle");
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dto = addressDraftToDto(draft);
    if (!dto) {
      setMessage("Выберите адрес из подсказки.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.billing.updateCompanyProfile({ factualAddress: dto });
      onSaved(updated);
    } catch (error) {
      setMessage(errorText(error, "Не удалось сохранить адрес."));
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = selected ? [draft.region, draft.city].filter(Boolean).join(", ") : "Адрес пока не выбран";
  const previewDetail = selected
    ? [draft.street, draft.building, draft.postcode].filter(Boolean).join(", ") ||
      "Точный адрес сохранится из подсказки."
    : "Начните вводить адрес и выберите подходящий вариант.";

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
    <div
      aria-labelledby="account-company-address-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-address-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Компания</span>
            <h2 id="account-company-address-dialog-title">Адрес компании</h2>
            <p>Этот адрес будет подставляться в новые объявления и станет точкой компании на карте.</p>
          </div>
          <button
            aria-label="Закрыть редактирование адреса компании"
            className="account-password-modal-close"
            disabled={saving}
            onClick={closeDialog}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="account-form account-password-modal-form account-address-form" onSubmit={submit}>
          <div className="account-address-field">
            <span className="account-address-field-label">Страна</span>
            <div className="account-address-country-toggle" role="group" aria-label="Страна адреса компании">
              {(["RU", "BY"] as const).map((code) => (
                <button
                  aria-pressed={draft.countryCode === code}
                  className={draft.countryCode === code ? "is-active" : ""}
                  disabled={saving}
                  key={code}
                  onClick={() => selectCountry(code)}
                  type="button"
                >
                  {code === "RU" ? "Россия" : "Беларусь"}
                </button>
              ))}
            </div>
          </div>
          <label htmlFor={COMPANY_ADDRESS_SEARCH_ID}>
            <span>Поиск адреса</span>
            <div className="account-address-search">
              <input
                aria-controls={COMPANY_ADDRESS_SUGGESTIONS_ID}
                aria-expanded={suggestState === "open"}
                autoComplete="off"
                className="input"
                disabled={saving}
                id={COMPANY_ADDRESS_SEARCH_ID}
                onBlur={() => {
                  window.setTimeout(() => {
                    setSuggestState((current) => (current === "open" || current === "empty" ? "idle" : current));
                  }, 120);
                }}
                onChange={(event) => changeQuery(event.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestState("open");
                }}
                placeholder="Начните вводить адрес и выберите вариант…"
                role="combobox"
                value={draft.query}
              />
              {suggestState === "open" ? (
                <div className="account-address-suggestions" id={COMPANY_ADDRESS_SUGGESTIONS_ID} role="listbox">
                  {suggestions.map((suggestion, index) => (
                    <button
                      aria-selected={false}
                      key={`${suggestion.value}-${index}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(suggestion);
                      }}
                      role="option"
                      type="button"
                    >
                      {suggestion.value}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
          {suggestState === "loading" ? <p className="account-address-hint">Ищем варианты…</p> : null}
          {suggestState === "empty" ? (
            <p className="account-address-hint">Варианты не найдены. Уточните адрес в строке поиска.</p>
          ) : null}
          {suggestState === "failed" ? (
            <p className="account-form-message account-form-message-error">
              Подсказки временно недоступны. Попробуйте ещё раз чуть позже.
            </p>
          ) : null}
          <div className={`account-address-preview${selected ? " is-filled" : ""}`}>
            <MapPin aria-hidden="true" size={17} strokeWidth={2.1} />
            <div>
              <span>{previewTitle}</span>
              <p>{previewDetail}</p>
            </div>
          </div>
          {message ? <p className="account-form-message account-form-message-error">{message}</p> : null}
          <button className="button" disabled={saving} type="submit">
            {saving ? "Сохраняем..." : "Сохранить адрес"}
          </button>
        </form>
      </section>
    </div>
  );
}

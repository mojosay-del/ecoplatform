import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Bell, Check, CreditCard, FileText, Smartphone } from "lucide-react";
import type { BillingStatus, UserGender } from "@ecoplatform/shared";
import type { User } from "../../lib/auth";
import { api } from "../../lib/api";
import {
  COMPANY_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  PLATFORM_ROLE_LABELS,
  USER_GENDER_LABELS,
} from "../../lib/display-labels";
import { AccountAvatarEditor } from "./AccountAvatarEditor";
import { describeSubscription } from "./format";
import { AccountDetailList, AccountEditableValue, AccountPasswordValue, AccountScrollSection } from "./shared";
import { CompanyProfileForm } from "./CompanyProfileForm";

export function AccountProfileSection({
  billing,
  billingState,
  greeting,
  isPlatformStaff,
  onBillingSaved,
  onOpenNotifications,
  onOpenPassword,
  onOpenPayment,
  onOpenSessions,
  onOpenSubscription,
  onProfileSaved,
  sessionsCount,
  user,
}: {
  billing: BillingStatus | null;
  billingState: string;
  greeting: string;
  isPlatformStaff: boolean;
  onBillingSaved: (updated: BillingStatus) => void;
  onOpenNotifications: () => void;
  onOpenPassword: () => void;
  onOpenPayment: () => void;
  onOpenSessions: () => void;
  onOpenSubscription: () => void;
  onProfileSaved: () => Promise<void>;
  sessionsCount: number;
  user: User | null;
}) {
  const subscription = describeSubscription(billing);
  const companyStatusLabel = billing?.status ? (COMPANY_STATUS_LABELS[billing.status] ?? billing.status) : null;
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Не авторизован";
  const company = billing;
  const profileChecks: Array<{ label: string; done: boolean }> = [
    { label: "Подтверждённая почта", done: Boolean(user?.email) },
    { label: "Указанный телефон", done: Boolean(user?.phone) },
    { label: "Добавлен способ оплаты", done: false },
    {
      label: "Активная подписка",
      done:
        billing?.status === "active" &&
        (billing?.subscriptionPlan === "basic" || billing?.subscriptionPlan === "extended"),
    },
  ];
  const profileCompletion = Math.round(
    (profileChecks.filter((check) => check.done).length / profileChecks.length) * 100,
  );
  const profileComplete = profileCompletion >= 100;

  return (
    <AccountScrollSection accountSection="profile">
      {/* Обзор: приветствие, идентификация, кольцо заполнения профиля и
          мини-статистика. Раньше тут был статичный hero с аватаром 128px. */}
      <header className="account-welcome">
        <AccountAvatarEditor />
        <div className="account-welcome-info">
          <span className="account-welcome-hi">{greeting},</span>
          <h1 className="account-welcome-name">{fullName}</h1>
          <div className="account-welcome-tags">
            {isPlatformStaff ? (
              user?.platformRoles?.map((role) => (
                <span className="account-welcome-tag" key={role}>
                  {PLATFORM_ROLE_LABELS[role] ?? role}
                </span>
              ))
            ) : (
              <>
                {company?.organizationName ? (
                  <span className="account-welcome-tag">
                    <span className="account-welcome-dot" aria-hidden="true" />
                    {company.organizationName}
                  </span>
                ) : null}
                {company?.type ? (
                  <span className="account-welcome-tag">{COMPANY_TYPE_LABELS[company.type] ?? company.type}</span>
                ) : null}
                {companyStatusLabel ? <span className="account-welcome-tag">{companyStatusLabel}</span> : null}
              </>
            )}
          </div>
        </div>
        {!isPlatformStaff ? (
          <div className="account-welcome-ring" aria-label={`Профиль заполнен на ${profileCompletion}%`}>
            <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-hidden="true">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="9" />
              <circle
                className="account-ring-progress"
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="#ffffff"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={251}
                strokeDashoffset={Math.round(251 * (1 - profileCompletion / 100))}
                transform="rotate(-90 48 48)"
              />
              {profileComplete ? (
                <g>
                  <circle cx="48" cy="48" r="20" fill="#ffffff" />
                  <path
                    d="M40 48l6 6 11-12"
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ) : (
                <text
                  x="48"
                  y="48"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="20"
                  fontWeight="800"
                  fill="#ffffff"
                >
                  {profileCompletion}%
                </text>
              )}
            </svg>
            <span className="account-welcome-ring-label">Профиль заполнен</span>
          </div>
        ) : null}
      </header>

      {!isPlatformStaff ? (
        <div className="account-stats">
          <button className="account-stat" type="button" onClick={onOpenSubscription}>
            <span className="account-stat-icon account-stat-warn">
              <CreditCard size={20} />
            </span>
            <span className="account-stat-value">{subscription.tariff}</span>
            <span className="account-stat-label">Подписка</span>
            <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
          </button>
          <button className="account-stat" type="button" onClick={onOpenPayment}>
            <span className="account-stat-icon account-stat-brand">
              <FileText size={20} />
            </span>
            <span className="account-stat-value">Платежные данные</span>
            <span className="account-stat-label">Оплата и документы</span>
            <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
          </button>
          <button className="account-stat" type="button" onClick={onOpenSessions}>
            <span className="account-stat-icon account-stat-info">
              <Smartphone size={20} />
            </span>
            <span className="account-stat-value">{sessionsCount}</span>
            <span className="account-stat-label">Активные сессии</span>
            <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
          </button>
          <button className="account-stat" type="button" onClick={onOpenNotifications}>
            <span className="account-stat-icon account-stat-green">
              <Bell size={20} />
            </span>
            <span className="account-stat-value">Вкл</span>
            <span className="account-stat-label">Уведомления</span>
            <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="account-section-grid">
        <article className="card account-card">
          <h2>Личные данные</h2>
          <AccountDetailList
            rows={[
              { label: "Имя", value: fullName },
              { label: "Пол", value: <AccountGenderValue value={user?.gender ?? null} onSaved={onProfileSaved} /> },
              { label: "Email", value: <AccountEditableValue value={user?.email} label="Email" /> },
              { label: "Пароль", value: <AccountPasswordValue onEdit={onOpenPassword} /> },
              { label: "Телефон", value: <AccountEditableValue value={user?.phone} label="Телефон" /> },
            ]}
          />
        </article>
        {/* Для сотрудников платформы карточка компании не нужна — их роли уже
            показаны в верхней приветственной плашке кабинета. */}
        {!isPlatformStaff ? (
          billing ? (
            <CompanyProfileForm billing={billing} onSaved={onBillingSaved} />
          ) : (
            <article className="card account-card">
              <h2>Компания</h2>
              <p className="page-subtitle">
                {billingState === "loading" ? "Загружаем реквизиты компании..." : "Данные компании пока недоступны."}
              </p>
            </article>
          )
        ) : null}
      </div>
    </AccountScrollSection>
  );
}

function AccountGenderValue({ onSaved, value }: { onSaved: () => Promise<void>; value: User["gender"] | null }) {
  const currentValue = value ?? "";
  const [selected, setSelected] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const dirty = selected !== currentValue;

  useEffect(() => {
    setSelected(currentValue);
    setMessage(null);
  }, [currentValue]);

  async function submitGender(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;

    setSaving(true);
    setMessage(null);
    try {
      await api.account.updateProfile({ gender: selected ? (selected as UserGender) : null });
      await onSaved();
      setMessage({ type: "ok", text: "Сохранено." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Не удалось сохранить." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-inline-form" onSubmit={submitGender}>
      <select
        aria-label="Пол"
        className="select account-inline-select"
        disabled={saving}
        onChange={(event) => setSelected(event.currentTarget.value)}
        value={selected}
      >
        <option value="">Не указано</option>
        <option value="male">{USER_GENDER_LABELS.male}</option>
        <option value="female">{USER_GENDER_LABELS.female}</option>
      </select>
      <button className="button secondary account-inline-save" disabled={!dirty || saving} type="submit">
        <Check aria-hidden="true" size={14} />
        {saving ? "Сохраняем..." : "Сохранить"}
      </button>
      {message ? (
        <span className={`account-form-message account-form-message-${message.type}`}>{message.text}</span>
      ) : null}
    </form>
  );
}

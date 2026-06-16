"use client";

// Экран «Рассылка»: админ отправляет in-app уведомление от платформы выбранной
// аудитории (фильтры по типу компании, подписке, полу, роли). Перед отправкой
// можно посмотреть охват. Канал доставки — только in-app (категория system).

import { FormEvent, useState } from "react";
import { Megaphone } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { COMPANY_TYPE_LABELS, SUBSCRIPTION_PLAN_LABELS, USER_GENDER_LABELS } from "../../../lib/display-labels";
import { PageHeader } from "../../shared";

type Audience = {
  companyType?: string;
  subscriptionPlan?: string;
  gender?: string;
  companyRole?: string;
  includeBlocked?: boolean;
};

const COMPANY_TYPE_OPTIONS = ["collector", "trader", "processor"] as const;
const SUBSCRIPTION_OPTIONS = ["basic", "extended"] as const;
const GENDER_OPTIONS = ["male", "female"] as const;
const COMPANY_ROLE_LABELS: Record<string, string> = { owner: "Владелец", member: "Сотрудник" };

const MAX_TITLE = 160;
const MAX_BODY = 2000;

export function AdminBroadcastView() {
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audience, setAudience] = useState<Audience>({});
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildAudienceBody(): Audience {
    const result: Audience = {};
    if (audience.companyType) result.companyType = audience.companyType;
    if (audience.subscriptionPlan) result.subscriptionPlan = audience.subscriptionPlan;
    if (audience.gender) result.gender = audience.gender;
    if (audience.companyRole) result.companyRole = audience.companyRole;
    if (audience.includeBlocked) result.includeBlocked = true;
    return result;
  }

  // Сброс посчитанного охвата при смене фильтров — чтобы число не вводило в заблуждение.
  function patchAudience(patch: Audience) {
    setAudience((prev) => ({ ...prev, ...patch }));
    setRecipientCount(null);
  }

  async function preview() {
    if (!token) return;
    setPreviewing(true);
    setError(null);
    try {
      const res = await apiFetch<{ recipientCount: number }>("/admin/broadcast/recipients-count", {
        method: "POST",
        token,
        body: { audience: buildAudienceBody() },
      });
      setRecipientCount(res.recipientCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось посчитать аудиторию.");
    } finally {
      setPreviewing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !title.trim() || !body.trim()) return;
    if (!confirm("Отправить уведомление выбранной аудитории? Это действие нельзя отменить.")) return;

    setSending(true);
    setError(null);
    setFlash(null);
    try {
      const res = await apiFetch<{ recipientCount: number }>("/admin/broadcast", {
        method: "POST",
        token,
        body: {
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
          audience: buildAudienceBody(),
        },
      });
      setFlash(`Отправлено получателям: ${res.recipientCount}.`);
      setTitle("");
      setBody("");
      setLink("");
      setRecipientCount(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить рассылку.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader
          title="Рассылка уведомлений"
          subtitle="Сообщение от платформы появится у получателей в колокольчике уведомлений."
        />
        {flash ? <p className="cms-flash">{flash}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <form className="form news-form" onSubmit={submit} style={{ maxWidth: 720 }}>
          <label className="indices-title-field">
            <span>Заголовок</span>
            <input
              className="news-form-lead education-module-title-input"
              maxLength={MAX_TITLE}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="form-field news-content-field">
            <span>Текст</span>
            <textarea
              className="input"
              rows={5}
              maxLength={MAX_BODY}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </label>

          <label className="form-field news-content-field">
            <span>Ссылка (необязательно)</span>
            <input
              className="input"
              placeholder="/marketplace или https://…"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          </label>

          <fieldset className="auth-section">
            <legend className="auth-section-title">Аудитория</legend>
            <div className="auth-grid-2">
              <label className="form-field">
                <span>Тип компании</span>
                <select
                  className="input"
                  value={audience.companyType ?? ""}
                  onChange={(event) => patchAudience({ companyType: event.target.value || undefined })}
                >
                  <option value="">Все</option>
                  {COMPANY_TYPE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {COMPANY_TYPE_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Подписка</span>
                <select
                  className="input"
                  value={audience.subscriptionPlan ?? ""}
                  onChange={(event) => patchAudience({ subscriptionPlan: event.target.value || undefined })}
                >
                  <option value="">Все</option>
                  {SUBSCRIPTION_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {SUBSCRIPTION_PLAN_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Пол</span>
                <select
                  className="input"
                  value={audience.gender ?? ""}
                  onChange={(event) => patchAudience({ gender: event.target.value || undefined })}
                >
                  <option value="">Все</option>
                  {GENDER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {USER_GENDER_LABELS[value] ?? value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Роль в компании</span>
                <select
                  className="input"
                  value={audience.companyRole ?? ""}
                  onChange={(event) => patchAudience({ companyRole: event.target.value || undefined })}
                >
                  <option value="">Все</option>
                  {Object.entries(COMPANY_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="consent-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={audience.includeBlocked ?? false}
                onChange={(event) => patchAudience({ includeBlocked: event.target.checked })}
              />
              <span>Включая заблокированных пользователей</span>
            </label>
          </fieldset>

          <div className="lesson-save-bar news-save-bar">
            <span className="lesson-save-bar-status">
              {recipientCount !== null ? `Под фильтры попадает получателей: ${recipientCount}` : "Охват не посчитан"}
            </span>
            <div className="lesson-save-bar-actions">
              <button className="button secondary" type="button" onClick={preview} disabled={previewing}>
                {previewing ? "Считаю…" : "Показать получателей"}
              </button>
              <button className="button" type="submit" disabled={sending || !title.trim() || !body.trim()}>
                <Megaphone size={15} /> {sending ? "Отправляю…" : "Отправить"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </AppShell>
  );
}

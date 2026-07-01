"use client";

// Экран «Рассылка»: админ отправляет in-app уведомление от платформы выбранной
// аудитории (фильтры по типу компании, подписке, полу, роли). Перед отправкой
// можно посмотреть охват. Канал доставки — только in-app (категория system).

import { FormEvent, useState } from "react";
import { Bell, Users } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { SendActionIcon } from "../../../components/app-shell/nav-icons";
import { AdminPageHeader } from "../../../components/admin";
import { PopoverSelect, type PopoverSelectOption } from "../../../components/ui/PopoverSelect";
import { errorText, api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { COMPANY_TYPE_LABELS, SUBSCRIPTION_PLAN_LABELS, USER_GENDER_LABELS } from "../../../lib/display-labels";

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

// «Все» + конкретные значения — для поповер-селектов аудитории.
const ALL_OPTION: PopoverSelectOption = { value: "", label: "Все" };
const COMPANY_TYPE_SELECT: PopoverSelectOption[] = [
  ALL_OPTION,
  ...COMPANY_TYPE_OPTIONS.map((value) => ({ value, label: COMPANY_TYPE_LABELS[value] ?? value })),
];
const SUBSCRIPTION_SELECT: PopoverSelectOption[] = [
  ALL_OPTION,
  ...SUBSCRIPTION_OPTIONS.map((value) => ({ value, label: SUBSCRIPTION_PLAN_LABELS[value] ?? value })),
];
const GENDER_SELECT: PopoverSelectOption[] = [
  ALL_OPTION,
  ...GENDER_OPTIONS.map((value) => ({ value, label: USER_GENDER_LABELS[value] ?? value })),
];
const COMPANY_ROLE_SELECT: PopoverSelectOption[] = [
  ALL_OPTION,
  ...Object.entries(COMPANY_ROLE_LABELS).map(([value, label]) => ({ value, label })),
];

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
      const res = await api.admin.broadcast.recipientsCount(buildAudienceBody(), { token });
      setRecipientCount(res.recipientCount);
    } catch (err) {
      setError(errorText(err, "Не удалось посчитать аудиторию."));
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
      const res = await api.admin.broadcast.send(
        {
          title: title.trim(),
          body: body.trim(),
          link: link.trim() || undefined,
          audience: buildAudienceBody(),
        },
        { token },
      );
      setFlash(`Отправлено получателям: ${res.recipientCount}.`);
      setTitle("");
      setBody("");
      setLink("");
      setRecipientCount(null);
    } catch (err) {
      setError(errorText(err, "Не удалось отправить рассылку."));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <AdminPageHeader
          subtitle="Сообщение от платформы появится у получателей в колокольчике уведомлений."
          title="Рассылка уведомлений"
        />
        {flash ? <p className="cms-flash">{flash}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <form className="admin-broadcast-layout" onSubmit={submit}>
          <div className="admin-broadcast-main">
            <div className="admin-broadcast-card">
              <h2 className="admin-broadcast-card-title">Сообщение</h2>
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
            </div>

            <div className="admin-broadcast-preview">
              <span className="admin-broadcast-preview-label">Предпросмотр уведомления</span>
              <article className="admin-broadcast-bell">
                <span className="admin-broadcast-bell-icon" aria-hidden>
                  <Bell size={18} />
                </span>
                <div className="admin-broadcast-bell-copy">
                  <strong>{title.trim() || "Заголовок уведомления"}</strong>
                  <p>{body.trim() || "Текст уведомления появится здесь по мере ввода."}</p>
                  {link.trim() ? <span className="admin-broadcast-bell-link">{link.trim()}</span> : null}
                </div>
              </article>
            </div>
          </div>

          <aside className="admin-broadcast-rail">
            <div className="admin-broadcast-card">
              <h2 className="admin-broadcast-card-title">Аудитория</h2>
              <div className="form-grid-2">
                <div className="form-field">
                  <span id="broadcast-company-type">Тип компании</span>
                  <PopoverSelect
                    label="Тип компании"
                    labelId="broadcast-company-type"
                    value={audience.companyType ?? ""}
                    options={COMPANY_TYPE_SELECT}
                    onChange={(value) => patchAudience({ companyType: value || undefined })}
                  />
                </div>

                <div className="form-field">
                  <span id="broadcast-subscription">Подписка</span>
                  <PopoverSelect
                    label="Подписка"
                    labelId="broadcast-subscription"
                    value={audience.subscriptionPlan ?? ""}
                    options={SUBSCRIPTION_SELECT}
                    onChange={(value) => patchAudience({ subscriptionPlan: value || undefined })}
                  />
                </div>

                <div className="form-field">
                  <span id="broadcast-gender">Пол</span>
                  <PopoverSelect
                    label="Пол"
                    labelId="broadcast-gender"
                    value={audience.gender ?? ""}
                    options={GENDER_SELECT}
                    onChange={(value) => patchAudience({ gender: value || undefined })}
                  />
                </div>

                <div className="form-field">
                  <span id="broadcast-company-role">Роль в компании</span>
                  <PopoverSelect
                    label="Роль в компании"
                    labelId="broadcast-company-role"
                    value={audience.companyRole ?? ""}
                    options={COMPANY_ROLE_SELECT}
                    onChange={(value) => patchAudience({ companyRole: value || undefined })}
                  />
                </div>
              </div>

              <label className="consent-row u-mt-12">
                <input
                  type="checkbox"
                  checked={audience.includeBlocked ?? false}
                  onChange={(event) => patchAudience({ includeBlocked: event.target.checked })}
                />
                <span>Включая заблокированных пользователей</span>
              </label>
            </div>

            <div className="admin-broadcast-send">
              <div className="admin-broadcast-reach">
                <span className="admin-broadcast-reach-icon" aria-hidden>
                  <Users size={18} />
                </span>
                <div className="admin-broadcast-reach-copy">
                  <strong>{recipientCount !== null ? recipientCount.toLocaleString("ru-RU") : "—"}</strong>
                  <span>{recipientCount !== null ? "получателей под фильтры" : "охват не посчитан"}</span>
                </div>
              </div>
              <button className="button secondary" type="button" onClick={preview} disabled={previewing}>
                {previewing ? "Считаю…" : "Показать получателей"}
              </button>
              <button className="button" type="submit" disabled={sending || !title.trim() || !body.trim()}>
                <SendActionIcon size={18} /> {sending ? "Отправляю…" : "Отправить"}
              </button>
            </div>
          </aside>
        </form>
      </section>
    </AppShell>
  );
}

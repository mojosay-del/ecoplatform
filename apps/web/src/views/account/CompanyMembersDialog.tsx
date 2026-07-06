import { useEffect, useState } from "react";
import { Mail, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import type { CompanyMembersView, MemberSection } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { formatRub } from "../../lib/formatters";
import { useAccountDialogBodyLock } from "./hooks";

export function CompanyMembersDialog({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<CompanyMembersView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSections, setInviteSections] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useAccountDialogBodyLock(true, onClose, inviting || busyId !== null);

  useEffect(() => {
    let cancelled = false;
    api.companyMembers
      .list()
      .then((data) => {
        if (!cancelled) setView(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof ApiError ? error.message : "Не удалось загрузить сотрудников.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available: MemberSection[] = view?.availableSections ?? [];

  function toggleInviteSection(key: string) {
    setInviteSections((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  async function submitInvite() {
    setInviteMessage(null);
    setActionError(null);
    const email = inviteEmail.trim();
    if (!email) {
      setActionError("Укажите email сотрудника.");
      return;
    }
    setInviting(true);
    try {
      const next = await api.companyMembers.invite({ email, allowedSections: inviteSections });
      setView(next);
      setInviteEmail("");
      setInviteSections([]);
      setInviteMessage("Приглашение отправлено на почту сотрудника.");
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Не удалось отправить приглашение.");
    } finally {
      setInviting(false);
    }
  }

  async function runMemberAction(id: string, action: () => Promise<CompanyMembersView>) {
    setBusyId(id);
    setActionError(null);
    try {
      setView(await action());
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Не удалось выполнить действие.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleMemberSection(userId: string, current: string[], key: string) {
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    await runMemberAction(userId, () => api.companyMembers.setSections(userId, { allowedSections: next }));
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Удалить сотрудника ${name}? Его аккаунт и доступ к компании будут удалены.`)) return;
    await runMemberAction(userId, () => api.companyMembers.removeMember(userId));
  }

  async function revokeInvite(id: string) {
    await runMemberAction(id, () => api.companyMembers.revokeInvitation(id));
  }

  const pricing = view?.pricing;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону закрывает; клавиатурный паритет — Escape (useAccountDialogBodyLock) + кнопка
    <div
      aria-labelledby="account-members-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !inviting && busyId === null) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-members-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Команда</span>
            <h2 id="account-members-dialog-title">Сотрудники</h2>
            <p>Пригласите коллег в компанию и выберите, какие разделы им доступны.</p>
          </div>
          <button
            aria-label="Закрыть сотрудников"
            className="account-password-modal-close"
            disabled={inviting || busyId !== null}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="account-members-body">
          {loadError ? <p className="account-form-message">{loadError}</p> : null}
          {!view && !loadError ? <p className="page-subtitle">Загрузка…</p> : null}

          {view ? (
            <>
              {pricing ? (
                <div className="account-members-pricing">
                  <div>
                    <span className="account-members-pricing-label">Ежемесячная стоимость</span>
                    <strong className="account-members-pricing-total">
                      {pricing.plan ? formatRub(pricing.total) : "— "}
                    </strong>
                  </div>
                  <p className="account-members-pricing-note">
                    {pricing.plan
                      ? `Тариф ${formatRub(pricing.base)} + ${formatRub(pricing.surchargePerSeat)} за каждого сотрудника (сейчас доп. мест: ${pricing.extraSeats}). Расчёт информационный — списаний нет.`
                      : "Активируйте подписку компании, чтобы увидеть расчёт стоимости мест."}
                  </p>
                </div>
              ) : null}

              {/* Приглашение нового сотрудника */}
              <article className="card account-card account-members-invite">
                <h3>Пригласить сотрудника</h3>
                <div className="account-members-invite-row">
                  <label className="account-members-field">
                    <span>Email сотрудника</span>
                    <input
                      className="input"
                      type="email"
                      placeholder="colleague@company.ru"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </label>
                </div>
                {available.length > 0 ? (
                  <div className="account-members-sections">
                    <span className="account-members-sections-label">Доступ к разделам</span>
                    <div className="account-members-sections-grid">
                      {available.map((section) => (
                        <label className="account-members-check" key={section.key}>
                          <input
                            type="checkbox"
                            checked={inviteSections.includes(section.key)}
                            onChange={() => toggleInviteSection(section.key)}
                          />
                          <span>{section.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                {inviteMessage ? <p className="account-form-message account-form-message-ok">{inviteMessage}</p> : null}
                <button
                  className="button account-block-button"
                  type="button"
                  onClick={submitInvite}
                  disabled={inviting}
                >
                  <UserPlus size={16} />
                  {inviting ? "Отправляем…" : "Отправить приглашение"}
                </button>
              </article>

              {actionError ? <p className="account-form-message">{actionError}</p> : null}

              {/* Список сотрудников */}
              <div className="account-members-list">
                {view.members.map((member) => {
                  const isOwner = member.role === "owner";
                  const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
                  const expanded = expandedMemberId === member.userId;
                  return (
                    <article className="account-members-item" key={member.userId}>
                      <div className="account-members-item-main">
                        <span className="account-members-avatar" aria-hidden="true">
                          {(member.firstName[0] ?? "") + (member.lastName[0] ?? "") || "?"}
                        </span>
                        <div className="account-members-item-info">
                          <strong>{name}</strong>
                          <span>{member.email}</span>
                        </div>
                        <span className={`account-members-role ${isOwner ? "is-owner" : ""}`}>
                          {isOwner ? (
                            <>
                              <ShieldCheck aria-hidden="true" size={13} /> Владелец
                            </>
                          ) : (
                            "Сотрудник"
                          )}
                        </span>
                      </div>
                      {!isOwner ? (
                        <div className="account-members-item-actions">
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => setExpandedMemberId(expanded ? null : member.userId)}
                          >
                            {expanded ? "Скрыть доступ" : "Настроить доступ"}
                          </button>
                          <button
                            className="button secondary danger"
                            type="button"
                            disabled={busyId === member.userId}
                            onClick={() => removeMember(member.userId, name)}
                          >
                            <Trash2 size={15} /> Удалить
                          </button>
                        </div>
                      ) : null}
                      {!isOwner && expanded ? (
                        <div className="account-members-sections-grid account-members-sections-edit">
                          {available.map((section) => (
                            <label className="account-members-check" key={section.key}>
                              <input
                                type="checkbox"
                                checked={member.allowedSections.includes(section.key)}
                                disabled={busyId === member.userId}
                                onChange={() => toggleMemberSection(member.userId, member.allowedSections, section.key)}
                              />
                              <span>{section.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              {/* Ожидающие приглашения */}
              {view.invitations.length > 0 ? (
                <div className="account-members-invites">
                  <span className="account-members-sections-label">Ожидают принятия</span>
                  {view.invitations.map((invitation) => (
                    <div className="account-members-invite-item" key={invitation.id}>
                      <span className="account-members-invite-icon" aria-hidden="true">
                        <Mail size={15} />
                      </span>
                      <span className="account-members-invite-email">{invitation.email}</span>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={busyId === invitation.id}
                        onClick={() => revokeInvite(invitation.id)}
                      >
                        Отозвать
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

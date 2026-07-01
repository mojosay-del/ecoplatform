import type { FormEvent } from "react";
import { Ban, Building2, ShieldAlert, Smartphone } from "lucide-react";
import { PopoverSelect, type PopoverSelectOption } from "../../../components/ui/PopoverSelect";
import { StatusPill, companyStatusPillVariant, userStatusPillVariant } from "../../../components/StatusPill";
import { COMPANY_STATUS_LABELS, MODERATION_REASON_LABELS, USER_STATUS_LABELS } from "../../../lib/display-labels";
import { blockReasonCodes } from "./constants";

const BLOCK_REASON_OPTIONS: PopoverSelectOption[] = blockReasonCodes.map((value) => ({
  value,
  label: MODERATION_REASON_LABELS[value] ?? value,
}));
import { formatLatestSession, formatSessionsCount } from "./format";
import type { AdminUserDetail } from "./types";

// Платформенные роли назначаются на странице «Сотрудники» — здесь, в карточке
// пользователя, этого блока намеренно нет (чтобы не было двух источников правды).
type AdminUserDetailPanelProps = {
  selected: AdminUserDetail | null;
  blockReason: string;
  blockComment: string;
  onBlockCommentChange: (value: string) => void;
  onBlockReasonChange: (value: string) => void;
  onBlockUser: (event: FormEvent<HTMLFormElement>) => void;
  onOpenSessions: () => void;
  onUnblockUser: () => void;
};

export function AdminUserDetailPanel({
  selected,
  blockReason,
  blockComment,
  onBlockCommentChange,
  onBlockReasonChange,
  onBlockUser,
  onOpenSessions,
  onUnblockUser,
}: AdminUserDetailPanelProps) {
  return (
    <div className="moderation-detail admin-user-detail">
      {!selected ? (
        <p className="page-subtitle auser-empty">Выберите пользователя.</p>
      ) : (
        <>
          <header className="auser-head">
            <div className="auser-avatar" aria-hidden="true">
              {(selected.firstName?.[0] ?? "") + (selected.lastName?.[0] ?? "") || "?"}
            </div>
            <div className="auser-id">
              <StatusPill variant={userStatusPillVariant(selected.status)}>
                {USER_STATUS_LABELS[selected.status]}
              </StatusPill>
              <h2 className="auser-name">
                {selected.firstName} {selected.lastName}
              </h2>
              <p className="auser-contacts">
                {selected.email} · {selected.phone}
              </p>
            </div>
            {selected.status === "blocked" ? (
              <button className="button secondary auser-unblock" onClick={onUnblockUser} type="button">
                Разблокировать
              </button>
            ) : null}
          </header>

          <section className="auser-section">
            <div className="auser-section-head">
              <Building2 aria-hidden size={15} />
              <span>Компания</span>
            </div>
            {selected.company ? (
              <p className="auser-company">
                {selected.company.organizationName}{" "}
                <StatusPill variant={companyStatusPillVariant(selected.company.status)}>
                  {COMPANY_STATUS_LABELS[selected.company.status] ?? selected.company.status}
                </StatusPill>
              </p>
            ) : (
              <p className="auser-muted">Не привязан к компании.</p>
            )}
          </section>

          <section className="auser-section">
            <div className="auser-section-head">
              <Ban aria-hidden size={15} />
              <span>Активные ограничения по модулям</span>
            </div>
            {selected.activeRestrictions.length === 0 ? (
              <p className="auser-muted">Нет.</p>
            ) : (
              <div className="stack-list">
                {selected.activeRestrictions.map((restriction) => (
                  <article className="auser-restriction" key={restriction.id}>
                    <strong>{restriction.moduleCode}</strong>
                    <p>
                      До {new Date(restriction.expiresAt).toLocaleString("ru-RU")} ·{" "}
                      {MODERATION_REASON_LABELS[restriction.reasonCode] ?? restriction.reasonCode}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="auser-section">
            <div className="auser-section-head">
              <Smartphone aria-hidden size={15} />
              <span>Последние сессии</span>
            </div>
            {selected.recentSessions.length === 0 ? (
              <p className="auser-muted">Нет данных о входах.</p>
            ) : (
              <button className="admin-sessions-trigger" onClick={onOpenSessions} type="button">
                <Smartphone aria-hidden size={18} />
                <span>
                  <strong>{formatSessionsCount(selected.recentSessions.length)}</strong>
                  <small>{formatLatestSession(selected.recentSessions[0]!)}</small>
                </span>
              </button>
            )}
          </section>

          {selected.status === "active" ? (
            <form className="form auser-danger" onSubmit={onBlockUser}>
              <div className="auser-section-head auser-danger-head">
                <ShieldAlert aria-hidden size={15} />
                <span>Заблокировать</span>
              </div>
              <PopoverSelect
                label="Причина блокировки"
                value={blockReason}
                options={BLOCK_REASON_OPTIONS}
                onChange={onBlockReasonChange}
              />
              <textarea
                className="textarea small"
                onChange={(event) => onBlockCommentChange(event.target.value)}
                placeholder="Комментарий (обязателен для «Иное»)"
                value={blockComment}
              />
              <button className="button danger" type="submit">
                Заблокировать пользователя
              </button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import type { ModerationSanction } from "@ecoplatform/shared";
import { StatusPill } from "../../../components/StatusPill";
import {
  ADMIN_SANCTION_TYPE_LABELS,
  MODERATION_REASON_LABELS,
  RESTRICTABLE_MODULE_LABELS,
} from "../../../lib/display-labels";
import { apiFetch, errorText } from "../../../lib/api";

const sanctionTypes = ["user_block", "company_block", "module_restriction"] as const;
const moduleCodes = ["comments", "marketplace", "reviews"] as const;
const reasonCodes = [
  "valid_complaint",
  "repeated_violation",
  "unfounded_complaint",
  "out_of_scope",
  "severe_violation",
  "other",
] as const;

type SanctionType = (typeof sanctionTypes)[number];
type ModuleCode = (typeof moduleCodes)[number];
type ReasonCode = (typeof reasonCodes)[number];

// Секция санкций кейса (только для admin). Список действующих/снятых санкций +
// форма применения. Бэкенд: POST cases/:id/admin-sanctions, sanctions/:id/lift.
export function ModerationSanctions({
  caseId,
  caseStatus,
  sanctions,
  onChanged,
}: {
  caseId: string;
  caseStatus: string;
  sanctions: ModerationSanction[];
  onChanged: () => Promise<void> | void;
}) {
  // Бэкенд разрешает админ-санкции только по эскалированному кейсу.
  const canApply = caseStatus === "escalated";
  const [type, setType] = useState<SanctionType>("user_block");
  const [reasonCode, setReasonCode] = useState<ReasonCode>("severe_violation");
  const [comment, setComment] = useState("");
  const [moduleCode, setModuleCode] = useState<ModuleCode>("comments");
  const [durationDays, setDurationDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsComment = reasonCode === "other";

  async function apply() {
    if (needsComment && !comment.trim()) {
      setError("Для причины «Иное» нужен комментарий.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/moderation/cases/${caseId}/admin-sanctions`, {
        method: "POST",
        body: {
          type,
          reasonCode,
          comment: comment.trim() || undefined,
          ...(type === "module_restriction" ? { moduleCode, durationDays } : {}),
        },
      });
      setComment("");
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Не удалось применить санкцию"));
    } finally {
      setBusy(false);
    }
  }

  async function lift(sanctionId: string) {
    if (!confirm("Снять эту санкцию?")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/moderation/sanctions/${sanctionId}/lift`, {
        method: "POST",
        body: { reasonCode: "unfounded_complaint", comment: "Снято администратором." },
      });
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Не удалось снять санкцию"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auser-section">
      <div className="auser-section-head">
        <Ban aria-hidden size={15} />
        <span>Санкции</span>
      </div>

      {sanctions.length === 0 ? (
        <p className="auser-muted">Санкций по этому кейсу нет.</p>
      ) : (
        <div className="stack-list mod-sanction-list">
          {sanctions.map((sanction) => {
            const active = sanction.liftedAt === null;
            const params = (sanction.parameters ?? {}) as { moduleCode?: string; durationDays?: number };
            return (
              <article className={`auser-restriction mod-sanction${active ? "" : " is-lifted"}`} key={sanction.id}>
                <div className="mod-sanction-main">
                  <strong>{ADMIN_SANCTION_TYPE_LABELS[sanction.type] ?? sanction.type}</strong>
                  <StatusPill variant={active ? "danger" : "neutral"}>{active ? "Действует" : "Снята"}</StatusPill>
                </div>
                <p>
                  {params.moduleCode
                    ? `Модуль: ${RESTRICTABLE_MODULE_LABELS[params.moduleCode] ?? params.moduleCode}`
                    : null}
                  {params.durationDays ? ` · ${params.durationDays} дн.` : null}
                  {!params.moduleCode && !params.durationDays
                    ? `Применена ${new Date(sanction.appliedAt).toLocaleDateString("ru-RU")}`
                    : null}
                </p>
                {active ? (
                  <button
                    className="button secondary mod-sanction-lift"
                    disabled={busy}
                    onClick={() => lift(sanction.id)}
                    type="button"
                  >
                    Снять
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {!canApply ? (
        <p className="auser-muted mod-sanction-hint">
          Применить новую санкцию можно только по эскалированному кейсу. Эскалируйте кейс решением «Эскалировать
          администратору».
        </p>
      ) : null}

      <div className="mod-sanction-form" hidden={!canApply}>
        <div className="auser-section-subhead">
          <ShieldAlert aria-hidden size={14} />
          <span>Применить санкцию</span>
        </div>
        <div className="mod-sanction-grid">
          <label className="form-field">
            <span>Тип</span>
            <select className="select" value={type} onChange={(event) => setType(event.target.value as SanctionType)}>
              {sanctionTypes.map((value) => (
                <option key={value} value={value}>
                  {ADMIN_SANCTION_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Причина</span>
            <select
              className="select"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value as ReasonCode)}
            >
              {reasonCodes.map((value) => (
                <option key={value} value={value}>
                  {MODERATION_REASON_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </label>
          {type === "module_restriction" ? (
            <>
              <label className="form-field">
                <span>Модуль</span>
                <select
                  className="select"
                  value={moduleCode}
                  onChange={(event) => setModuleCode(event.target.value as ModuleCode)}
                >
                  {moduleCodes.map((value) => (
                    <option key={value} value={value}>
                      {RESTRICTABLE_MODULE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Срок, дней</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={365}
                  value={durationDays}
                  onChange={(event) => setDurationDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))}
                />
              </label>
            </>
          ) : null}
        </div>
        <label className="form-field">
          <span>Комментарий{needsComment ? " (обязателен)" : ""}</span>
          <textarea
            className="textarea small"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Контекст санкции"
          />
        </label>
        {error ? (
          <StatusPill as="p" variant="danger">
            {error}
          </StatusPill>
        ) : null}
        <button className="button" disabled={busy} onClick={apply} type="button">
          {busy ? "Применяю…" : "Применить санкцию"}
        </button>
      </div>
    </section>
  );
}

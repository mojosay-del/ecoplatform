"use client";

import { FormEvent, useEffect, useState } from "react";
import type {
  ModerationCaseDetail,
  ModerationCaseListItem,
  ModerationDecisionType,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { ShieldCheck } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, moderationStatusPillVariant } from "../../../components/StatusPill";
import { AdminEmptyState, AdminPageHeader } from "../../../components/admin";
import { formatModerationCaseTitle, formatModerationEntityPreview } from "../../../components/admin-entity-display";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import {
  MODERATION_CASE_STATUS_LABELS,
  MODERATION_DECISION_LABELS,
  MODERATION_REASON_LABELS,
} from "../../../lib/display-labels";
import "../../content-blocks/checklist.css";

const decisionCodes = ["leave_as_is", "remove_content", "warn_company", "escalate_to_admin"] as const;
const reasonCodes = [
  "valid_complaint",
  "repeated_violation",
  "unfounded_complaint",
  "out_of_scope",
  "severe_violation",
  "other",
] as const;

type ModerationReasonCode = (typeof reasonCodes)[number];

export function AdminModerationView() {
  const [selectedCase, setSelectedCase] = useState<ModerationCaseDetail | null>(null);
  const [decisionType, setDecisionType] = useState<ModerationDecisionType>("leave_as_is");
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode>("valid_complaint");
  const [comment, setComment] = useState("");
  const {
    data: cases,
    state,
    errorMessage,
    refetch,
  } = useApiQuery<ModerationCaseListItem[]>(
    queryKeys.admin.moderationCases(),
    async () => (await apiFetch<PaginatedResponse<ModerationCaseListItem>>("/admin/moderation/cases?limit=100")).items,
    [],
  );

  // Держим выбор синхронным со списком: при загрузке/обновлении очереди
  // оставляем текущий кейс, если он ещё в списке, иначе выбираем первый.
  useEffect(() => {
    if (state !== "ready") return;
    setSelectedCase((current) => {
      if (current && cases.some((item) => item.id === current.id)) return current;
      return cases[0] ?? null;
    });
  }, [state, cases]);

  async function openCase(id: string) {
    const data = await apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${id}`);
    setSelectedCase(data);
  }

  async function mutateCase(path: string) {
    if (!selectedCase) return;
    const data = await apiFetch<ModerationCaseDetail>(path, { method: "POST" });
    setSelectedCase(data);
    await refetch();
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase) return;

    const data = await apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${selectedCase.id}/decisions`, {
      method: "POST",
      body: {
        type: decisionType,
        reasonCode,
        comment: comment.trim() || undefined,
      },
    });
    setComment("");
    setSelectedCase(data);
    await refetch();
  }

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Модерация</h1>
          <p className="page-subtitle">Войдите как сотрудник платформы.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Модерация</h1>
          <p className="page-subtitle">Недостаточно прав для этого раздела.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <AdminPageHeader
          count={state === "ready" ? cases.length : undefined}
          subtitle="Очередь жалоб на пользовательский контент."
          title="Модерация"
        />
        {state === "error" ? (
          <StatusPill as="p" variant="danger">
            {errorMessage}
          </StatusPill>
        ) : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}
        {state === "ready" ? (
          <div className="moderation-layout">
            <div className="stack-list">
              {cases.length === 0 ? (
                <AdminEmptyState
                  description="Новых жалоб на пользовательский контент сейчас нет."
                  icon={ShieldCheck}
                  title="Очередь пуста"
                />
              ) : null}
              {cases.map((item) => (
                <button
                  className={`moderation-case-row ${selectedCase?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => openCase(item.id)}
                  type="button"
                >
                  <StatusPill variant={moderationStatusPillVariant(item.status)}>
                    {MODERATION_CASE_STATUS_LABELS[item.status] ?? item.status}
                  </StatusPill>
                  <strong>{formatModerationCaseTitle(item)}</strong>
                  <span>{formatModerationEntityPreview(item)}</span>
                  <small>Жалоб: {item.complaints.length}</small>
                </button>
              ))}
            </div>
            <div className="moderation-detail">
              {!selectedCase ? (
                <p className="page-subtitle">Выберите кейс.</p>
              ) : (
                <>
                  <div className="list-row moderation-detail-heading">
                    <div>
                      <StatusPill as="p" variant={moderationStatusPillVariant(selectedCase.status)}>
                        {MODERATION_CASE_STATUS_LABELS[selectedCase.status] ?? selectedCase.status}
                      </StatusPill>
                      <h2>{formatModerationCaseTitle(selectedCase)}</h2>
                      <p className="admin-table-muted">{formatModerationEntityPreview(selectedCase)}</p>
                    </div>
                    <div className="moderation-detail-side">
                      <span className="technical-id">ID кейса: {selectedCase.id}</span>
                      <span className="technical-id">ID сущности: {selectedCase.entityId}</span>
                      <div className="form-actions">
                        <button
                          className="button secondary"
                          onClick={() => mutateCase(`/admin/moderation/cases/${selectedCase.id}/lock`)}
                        >
                          Взять
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => mutateCase(`/admin/moderation/cases/${selectedCase.id}/release`)}
                        >
                          Освободить
                        </button>
                      </div>
                    </div>
                  </div>
                  {selectedCase.lockedBy ? (
                    <p className="page-subtitle">
                      В работе у {selectedCase.lockedBy.firstName} {selectedCase.lockedBy.lastName} до{" "}
                      {selectedCase.lockedUntil ? new Date(selectedCase.lockedUntil).toLocaleTimeString("ru-RU") : ""}
                    </p>
                  ) : null}
                  <article className="moderated-content">
                    {selectedCase.entity?.type === "news_comment" ? (
                      <strong>
                        {selectedCase.entity.author?.firstName} {selectedCase.entity.author?.lastName}
                      </strong>
                    ) : null}
                    {selectedCase.entity?.type === "marketplace_listing" && selectedCase.entity.sellerCompany ? (
                      <strong>{selectedCase.entity.sellerCompany.organizationName}</strong>
                    ) : null}
                    {selectedCase.entity?.type === "marketplace_review" && selectedCase.entity.fromCompany ? (
                      <strong>Отзыв от {selectedCase.entity.fromCompany.organizationName}</strong>
                    ) : null}
                    <p>{formatModerationEntityPreview(selectedCase)}</p>
                  </article>
                  <section>
                    <h3>Жалобы</h3>
                    <div className="stack-list">
                      {selectedCase.complaints.map((complaint) => (
                        <article className="checklist-block" key={complaint.id}>
                          <strong>{MODERATION_REASON_LABELS[complaint.reasonCode] ?? complaint.reasonCode}</strong>
                          <p>{complaint.comment || "Без комментария"}</p>
                          <small>
                            {complaint.author?.firstName} {complaint.author?.lastName}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3>Решения</h3>
                    <div className="stack-list">
                      {selectedCase.decisions.length === 0 ? <p className="page-subtitle">Решений пока нет.</p> : null}
                      {selectedCase.decisions.map((decision) => (
                        <article className="checklist-block" key={decision.id}>
                          <strong>{MODERATION_DECISION_LABELS[decision.type] ?? decision.type}</strong>
                          <p>{MODERATION_REASON_LABELS[decision.reasonCode] ?? decision.reasonCode}</p>
                          <small>
                            {decision.actor?.firstName} {decision.actor?.lastName}
                          </small>
                        </article>
                      ))}
                    </div>
                  </section>
                  {selectedCase.status !== "resolved" && selectedCase.status !== "closed_by_admin" ? (
                    <form className="form moderation-decision-form" onSubmit={submitDecision}>
                      <select
                        className="select"
                        onChange={(event) => setDecisionType(event.target.value as ModerationDecisionType)}
                        value={decisionType}
                      >
                        {decisionCodes.map((value) => (
                          <option key={value} value={value}>
                            {MODERATION_DECISION_LABELS[value] ?? value}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        onChange={(event) => setReasonCode(event.target.value as ModerationReasonCode)}
                        value={reasonCode}
                      >
                        {reasonCodes.map((value) => (
                          <option key={value} value={value}>
                            {MODERATION_REASON_LABELS[value] ?? value}
                          </option>
                        ))}
                      </select>
                      <textarea
                        className="textarea small"
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Комментарий к решению"
                        value={comment}
                      />
                      <button className="button" type="submit">
                        Сохранить решение
                      </button>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

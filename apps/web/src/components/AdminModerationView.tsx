"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import { StatusPill, moderationStatusPillVariant } from "./StatusPill";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

const caseStatusLabels: Record<string, string> = {
  open: "Открыт",
  in_review: "В работе",
  resolved: "Решён",
  escalated: "Эскалирован",
  closed_by_admin: "Закрыт админом",
};

const decisionLabels = [
  ["leave_as_is", "Оставить без изменений"],
  ["remove_content", "Снять комментарий"],
  ["warn_company", "Предупредить компанию"],
  ["escalate_to_admin", "Эскалировать администратору"],
] as const;

const reasonLabels = [
  ["valid_complaint", "Жалоба обоснована"],
  ["repeated_violation", "Повторное нарушение"],
  ["unfounded_complaint", "Жалоба необоснована"],
  ["out_of_scope", "Вне компетенции модератора"],
  ["severe_violation", "Серьёзное нарушение"],
  ["other", "Иное"],
] as const;

export function AdminModerationView() {
  const { token } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [decisionType, setDecisionType] = useState("leave_as_is");
  const [reasonCode, setReasonCode] = useState("valid_complaint");
  const [comment, setComment] = useState("");

  async function loadCases(nextSelectedId?: string) {
    if (!token) {
      setState("unauthenticated");
      setCases([]);
      setSelectedCase(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    try {
      const data = await apiFetch<PaginatedResponse<any>>("/admin/moderation/cases?limit=100", { token });
      setCases(data.items);
      const selected = data.items.find((item) => item.id === nextSelectedId) ?? data.items[0] ?? null;
      setSelectedCase(selected);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить очередь модерации");
    }
  }

  async function openCase(id: string) {
    if (!token) return;
    const data = await apiFetch<any>(`/admin/moderation/cases/${id}`, { token });
    setSelectedCase(data);
  }

  async function mutateCase(path: string) {
    if (!token || !selectedCase) return;
    const data = await apiFetch<any>(path, { method: "POST", token });
    setSelectedCase(data);
    await loadCases(data.id);
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedCase) return;

    const data = await apiFetch<any>(`/admin/moderation/cases/${selectedCase.id}/decisions`, {
      method: "POST",
      token,
      body: {
        type: decisionType,
        reasonCode,
        comment: comment.trim() || undefined,
      },
    });
    setComment("");
    setSelectedCase(data);
    await loadCases(data.id);
  }

  useEffect(() => {
    void loadCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
        <header className="page-header">
          <h1 className="page-title">Модерация</h1>
          <p className="page-subtitle">Очередь жалоб на пользовательский контент.</p>
        </header>
        {state === "error" ? (
          <StatusPill as="p" variant="danger">
            {errorMessage}
          </StatusPill>
        ) : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}
        {state === "ready" ? (
          <div className="moderation-layout">
            <div className="stack-list">
              {cases.length === 0 ? <p className="page-subtitle">Кейсов нет.</p> : null}
              {cases.map((item) => (
                <button
                  className={`moderation-case-row ${selectedCase?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => openCase(item.id)}
                  type="button"
                >
                  <StatusPill variant={moderationStatusPillVariant(item.status)}>
                    {caseStatusLabels[item.status] ?? item.status}
                  </StatusPill>
                  <strong>{item.entity?.newsPost?.title ?? "Комментарий"}</strong>
                  <span>{item.entity?.text ?? item.entityId}</span>
                  <small>Жалоб: {item.complaints.length}</small>
                </button>
              ))}
            </div>
            <div className="moderation-detail">
              {!selectedCase ? (
                <p className="page-subtitle">Выберите кейс.</p>
              ) : (
                <>
                  <div className="list-row">
                    <div>
                      <StatusPill as="p" variant={moderationStatusPillVariant(selectedCase.status)}>
                        {caseStatusLabels[selectedCase.status] ?? selectedCase.status}
                      </StatusPill>
                      <h2>{selectedCase.entity?.newsPost?.title ?? "Кейс модерации"}</h2>
                    </div>
                    <div className="auth-actions">
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
                  {selectedCase.lockedBy ? (
                    <p className="page-subtitle">
                      В работе у {selectedCase.lockedBy.firstName} {selectedCase.lockedBy.lastName} до{" "}
                      {new Date(selectedCase.lockedUntil).toLocaleTimeString("ru-RU")}
                    </p>
                  ) : null}
                  <article className="moderated-content">
                    <strong>
                      {selectedCase.entity?.author?.firstName} {selectedCase.entity?.author?.lastName}
                    </strong>
                    <p>{selectedCase.entity?.text}</p>
                  </article>
                  <section>
                    <h3>Жалобы</h3>
                    <div className="stack-list">
                      {selectedCase.complaints.map((complaint: any) => (
                        <article className="checklist-block" key={complaint.id}>
                          <strong>{complaint.reasonCode}</strong>
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
                      {selectedCase.decisions.map((decision: any) => (
                        <article className="checklist-block" key={decision.id}>
                          <strong>{decision.type}</strong>
                          <p>{decision.reasonCode}</p>
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
                        onChange={(event) => setDecisionType(event.target.value)}
                        value={decisionType}
                      >
                        {decisionLabels.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        onChange={(event) => setReasonCode(event.target.value)}
                        value={reasonCode}
                      >
                        {reasonLabels.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
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

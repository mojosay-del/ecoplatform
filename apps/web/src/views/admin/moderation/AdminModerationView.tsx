"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ModerationCaseDetail,
  ModerationCaseListItem,
  ModerationCaseStatus,
  ModerationDecisionType,
} from "@ecoplatform/shared";
import { Lock, LockOpen, MessageSquareWarning, ScrollText, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, moderationStatusPillVariant } from "../../../components/StatusPill";
import { AdminEmptyState, AdminInfiniteFooter, AdminPageHeader } from "../../../components/admin";
import { formatModerationCaseTitle, formatModerationEntityPreview } from "../../../components/admin-entity-display";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { queryKeys } from "../../../lib/query/keys";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import {
  MODERATION_CASE_STATUS_LABELS,
  MODERATION_DECISION_LABELS,
  MODERATION_REASON_LABELS,
} from "../../../lib/display-labels";
import { ModerationSanctions } from "./moderation-sanctions";
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

const STATUS_FILTERS: { value: "" | ModerationCaseStatus; label: string }[] = [
  { value: "", label: "Все" },
  { value: "open", label: "Открытые" },
  { value: "in_review", label: "В работе" },
  { value: "escalated", label: "Эскалированные" },
  { value: "resolved", label: "Решённые" },
];

export function AdminModerationView() {
  const { user } = useAuth();
  const isAdmin = (user?.platformRoles ?? []).includes("admin");

  const [statusFilter, setStatusFilter] = useState<"" | ModerationCaseStatus>("");
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<ModerationCaseDetail | null>(null);
  const [decisionType, setDecisionType] = useState<ModerationDecisionType>("leave_as_is");
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode>("valid_complaint");
  const [comment, setComment] = useState("");

  const casesQuery = useInfiniteApiQuery<ModerationCaseListItem>(
    queryKeys.admin.moderationCases(statusFilter),
    50,
    ({ limit, offset }) => api.admin.moderation.cases({ limit, offset }, { status: statusFilter }),
  );

  // Поиск по заголовку/превью среди загруженных кейсов (полнотекст по
  // полиморфному контенту слишком тяжёл; статус фильтруется на сервере).
  const visibleCases = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return casesQuery.items;
    return casesQuery.items.filter((item) =>
      `${formatModerationCaseTitle(item)} ${formatModerationEntityPreview(item)}`.toLowerCase().includes(term),
    );
  }, [casesQuery.items, search]);

  // Держим выбор синхронным со списком.
  useEffect(() => {
    if (casesQuery.state !== "ready") return;
    setSelectedCase((current) => {
      if (current && visibleCases.some((item) => item.id === current.id)) return current;
      return null;
    });
  }, [casesQuery.state, visibleCases]);

  async function openCase(id: string) {
    const data = await api.admin.moderation.case(id);
    setSelectedCase(data);
  }

  async function reloadSelected() {
    if (selectedCase) {
      const data = await api.admin.moderation.case(selectedCase.id);
      setSelectedCase(data);
    }
    casesQuery.reload();
  }

  async function mutateCase(action: (caseId: string) => Promise<ModerationCaseDetail>) {
    if (!selectedCase) return;
    const data = await action(selectedCase.id);
    setSelectedCase(data);
    casesQuery.reload();
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCase) return;
    const data = await api.admin.moderation.decide(selectedCase.id, {
      type: decisionType,
      reasonCode,
      comment: comment.trim() || undefined,
    });
    setComment("");
    setSelectedCase(data);
    casesQuery.reload();
  }

  if (casesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Модерация</h1>
          <p className="page-subtitle">Войдите как сотрудник платформы.</p>
        </section>
      </AppShell>
    );
  }

  if (casesQuery.state === "forbidden") {
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
          count={casesQuery.state === "ready" ? casesQuery.total : undefined}
          subtitle="Очередь жалоб на пользовательский контент."
          title="Модерация"
        />

        <div className="forum-seg mod-status-filter" role="group" aria-label="Фильтр по статусу">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              aria-pressed={statusFilter === option.value}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="admin-filter-field mod-search">
          <Search aria-hidden size={16} />
          <input
            aria-label="Поиск по кейсам"
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по заголовку или содержимому загруженных кейсов"
            type="search"
            value={search}
          />
        </label>

        {casesQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {casesQuery.errorMessage}
          </StatusPill>
        ) : null}
        {casesQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="moderation-layout">
          <div className="stack-list mod-case-list">
            {visibleCases.length === 0 && !casesQuery.isInitialLoading ? (
              <AdminEmptyState
                description={
                  search
                    ? "Под запрос ничего не подошло среди загруженных кейсов."
                    : "Новых жалоб на пользовательский контент сейчас нет."
                }
                icon={ShieldCheck}
                title={search ? "Ничего не найдено" : "Очередь пуста"}
              />
            ) : null}
            {visibleCases.map((item) => (
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
            <AdminInfiniteFooter
              endLabel="Это все кейсы."
              hasItems={casesQuery.items.length > 0}
              hasMore={casesQuery.hasMore}
              isLoadingMore={casesQuery.isLoadingMore}
              sentinelRef={casesQuery.sentinelRef}
            />
          </div>

          <div className="moderation-detail admin-user-detail">
            {!selectedCase ? (
              <p className="page-subtitle auser-empty">Выберите кейс, чтобы увидеть жалобы, решения и санкции.</p>
            ) : (
              <>
                <header className="auser-head">
                  <div className="auser-avatar" aria-hidden="true">
                    <ShieldAlert size={20} />
                  </div>
                  <div className="auser-id">
                    <StatusPill variant={moderationStatusPillVariant(selectedCase.status)}>
                      {MODERATION_CASE_STATUS_LABELS[selectedCase.status] ?? selectedCase.status}
                    </StatusPill>
                    <h2 className="auser-name">{formatModerationCaseTitle(selectedCase)}</h2>
                    <p className="auser-contacts">{formatModerationEntityPreview(selectedCase)}</p>
                  </div>
                  <div className="mod-lock-actions">
                    <button
                      className="button secondary"
                      onClick={() => mutateCase(api.admin.moderation.lock)}
                      type="button"
                    >
                      <Lock aria-hidden size={15} /> Взять
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => mutateCase(api.admin.moderation.release)}
                      type="button"
                    >
                      <LockOpen aria-hidden size={15} /> Освободить
                    </button>
                  </div>
                </header>

                {selectedCase.lockedBy ? (
                  <p className="mod-lock-banner">
                    <Lock aria-hidden size={14} /> В работе у {selectedCase.lockedBy.firstName}{" "}
                    {selectedCase.lockedBy.lastName}
                    {selectedCase.lockedUntil
                      ? ` · до ${new Date(selectedCase.lockedUntil).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                ) : null}

                <section className="auser-section">
                  <div className="auser-section-head">
                    <ScrollText aria-hidden size={15} />
                    <span>Модерируемый контент</span>
                  </div>
                  <article className="moderated-content">
                    {selectedCase.entity?.type === "news_comment" && selectedCase.entity.author ? (
                      <strong>
                        {selectedCase.entity.author.firstName} {selectedCase.entity.author.lastName}
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
                </section>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <MessageSquareWarning aria-hidden size={15} />
                    <span>Жалобы ({selectedCase.complaints.length})</span>
                  </div>
                  <div className="stack-list">
                    {selectedCase.complaints.map((complaint) => (
                      <article className="auser-restriction" key={complaint.id}>
                        <strong>{MODERATION_REASON_LABELS[complaint.reasonCode] ?? complaint.reasonCode}</strong>
                        <p>{complaint.comment || "Без комментария"}</p>
                        {complaint.author ? (
                          <small>
                            {complaint.author.firstName} {complaint.author.lastName}
                          </small>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <ScrollText aria-hidden size={15} />
                    <span>Решения</span>
                  </div>
                  {selectedCase.decisions.length === 0 ? (
                    <p className="auser-muted">Решений пока нет.</p>
                  ) : (
                    <div className="stack-list">
                      {selectedCase.decisions.map((decision) => (
                        <article className="auser-restriction" key={decision.id}>
                          <strong>{MODERATION_DECISION_LABELS[decision.type] ?? decision.type}</strong>
                          <p>{MODERATION_REASON_LABELS[decision.reasonCode] ?? decision.reasonCode}</p>
                          {decision.actor ? (
                            <small>
                              {decision.actor.firstName} {decision.actor.lastName}
                            </small>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {isAdmin ? (
                  <ModerationSanctions
                    caseId={selectedCase.id}
                    caseStatus={selectedCase.status}
                    sanctions={selectedCase.sanctions}
                    onChanged={reloadSelected}
                  />
                ) : null}

                {selectedCase.status !== "resolved" && selectedCase.status !== "closed_by_admin" ? (
                  <section className="auser-section">
                    <div className="auser-section-head">
                      <ShieldCheck aria-hidden size={15} />
                      <span>Решение по кейсу</span>
                    </div>
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
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

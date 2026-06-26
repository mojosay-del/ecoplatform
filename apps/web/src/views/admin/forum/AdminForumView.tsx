"use client";
import "../../../styles/forum.css";

// CMS-экран «Форум»: управление справочниками (две оси, с переупорядочиванием),
// поиск/фильтр и модерация вопросов и ОТВЕТОВ, засев. Тонкий контейнер —
// состояние и операции в useAdminForum. Права инфорсит бэкенд; кнопки гейтятся.

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, MoveDown, MoveUp, Pencil, Search, Trash2, X } from "lucide-react";
import type { ForumQuestionStatus, ForumTaxonomyValue } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { AdminEmptyState, AdminInfiniteFooter, AdminPageHeader } from "../../../components/admin";
import { StatusBadge } from "../../forum/components";
import { relativeTime } from "../../forum/forum-helpers";
import { ForumQuestionAnswers } from "./forum-question-answers";
import { useAdminForum, type ForumAxis } from "./use-admin-forum";

const STATUS_FILTERS: { value: ForumQuestionStatus | ""; label: string }[] = [
  { value: "", label: "Все" },
  { value: "open", label: "Нужен ответ" },
  { value: "answered", label: "С ответами" },
  { value: "solved", label: "Решённые" },
  { value: "hidden", label: "Скрытые" },
];

export function AdminForumView() {
  const forum = useAdminForum();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (forum.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Форум</h1>
          <p className="page-subtitle">Войдите как сотрудник платформы.</p>
        </section>
      </AppShell>
    );
  }
  if (forum.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Форум</h1>
          <p className="page-subtitle">Раздел доступен админу, контент-менеджеру и модератору.</p>
        </section>
      </AppShell>
    );
  }

  const canSeed =
    forum.canManageTaxonomy && forum.taxonomy.rawMaterials.length > 0 && forum.taxonomy.questionTypes.length > 0;

  return (
    <AppShell>
      <section className="page forum-page">
        <AdminPageHeader
          count={forum.state === "ready" ? forum.questionsQuery.total : undefined}
          subtitle="Справочники тегов, засев и модерация вопросов и ответов раздела «Форум»."
          title="Форум"
        />
        {forum.message ? (
          <p className="cms-flash forum-flash">
            <span>{forum.message}</span>
            <button type="button" aria-label="Скрыть" onClick={() => forum.setMessage(null)}>
              <X size={14} />
            </button>
          </p>
        ) : null}

        {forum.canManageTaxonomy ? (
          <div className="forum-admin-grid">
            <TaxonomyEditor
              title="Вид сырья"
              axis="raw-materials"
              values={forum.taxonomy.rawMaterials}
              onCreate={forum.createValue}
              onRename={forum.renameValue}
              onDelete={forum.deleteValue}
              onReorder={forum.reorderValue}
            />
            <TaxonomyEditor
              title="Тип вопроса"
              axis="question-types"
              values={forum.taxonomy.questionTypes}
              onCreate={forum.createValue}
              onRename={forum.renameValue}
              onDelete={forum.deleteValue}
              onReorder={forum.reorderValue}
            />
          </div>
        ) : null}

        {forum.canManageTaxonomy ? (
          <SeedForm
            disabled={!canSeed}
            rawMaterials={forum.taxonomy.rawMaterials}
            questionTypes={forum.taxonomy.questionTypes}
            onSeed={forum.seedQuestion}
          />
        ) : null}

        <div className="card">
          <h3 className="u-mt-0">Вопросы</h3>

          <form className="forum-admin-search" onSubmit={forum.submitSearch} role="search">
            <label className="admin-filter-field">
              <Search aria-hidden size={16} />
              <input
                aria-label="Поиск вопросов"
                className="input"
                type="search"
                value={forum.search}
                onChange={(event) => forum.setSearch(event.target.value)}
                placeholder="Поиск по заголовку и тексту"
              />
            </label>
            <button className="button" type="submit">
              Найти
            </button>
            {forum.appliedSearch ? (
              <button className="button secondary" type="button" onClick={forum.resetSearch}>
                Сбросить
              </button>
            ) : null}
          </form>

          <div className="forum-seg u-mb-14" role="group" aria-label="Фильтр по статусу">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                aria-pressed={forum.statusFilter === option.value}
                onClick={() => forum.changeStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {forum.questions.length === 0 && !forum.questionsQuery.isInitialLoading ? (
            <AdminEmptyState
              icon={Search}
              title={forum.appliedSearch || forum.statusFilter ? "Ничего не найдено" : "Вопросов нет"}
              description={
                forum.appliedSearch || forum.statusFilter
                  ? "Под текущие фильтры вопросов не нашлось."
                  : "Засейте вопрос формой выше или дождитесь вопросов от пользователей."
              }
            />
          ) : (
            <div className="forum-admin-q-list">
              {forum.questions.map((question) => {
                const expanded = expandedId === question.id;
                return (
                  <div key={question.id} className="forum-admin-q-item">
                    <div className="forum-admin-q-row">
                      <button
                        type="button"
                        className="forum-admin-q-expand"
                        aria-expanded={expanded}
                        onClick={() => setExpandedId(expanded ? null : question.id)}
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="forum-admin-q-main">
                        <div className="forum-tags">
                          <StatusBadge status={question.status} />
                          {question.rawMaterial ? (
                            <span className="forum-chip">{question.rawMaterial.label}</span>
                          ) : null}
                          {question.questionType ? (
                            <span className="forum-chip">{question.questionType.label}</span>
                          ) : null}
                        </div>
                        <a href={`/forum/q/${question.id}`} className="forum-admin-q-title">
                          {question.title}
                        </a>
                        <p className="forum-count">
                          {question.authorName} · {question.answersCount} отв. · {question.views} просм. ·{" "}
                          {relativeTime(question.createdAt)}
                        </p>
                      </div>
                      {forum.canModerate ? (
                        <div className="forum-answer-actions">
                          {question.status === "hidden" ? (
                            <button
                              type="button"
                              className="forum-text-button"
                              onClick={() => void forum.moderate("restore", question.id)}
                            >
                              <Eye size={15} /> Восстановить
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="forum-text-button"
                              onClick={() => void forum.moderate("hide", question.id)}
                            >
                              <EyeOff size={15} /> Скрыть
                            </button>
                          )}
                          <button
                            type="button"
                            className="forum-text-button is-danger"
                            onClick={() => void forum.moderate("delete", question.id)}
                          >
                            <Trash2 size={15} /> Удалить
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? (
                      <ForumQuestionAnswers
                        questionId={question.id}
                        canModerate={forum.canModerate}
                        onAfterChange={forum.reloadQuestions}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <AdminInfiniteFooter
            endLabel="Это все вопросы."
            hasItems={forum.questions.length > 0}
            hasMore={forum.questionsQuery.hasMore}
            isLoadingMore={forum.questionsQuery.isLoadingMore}
            sentinelRef={forum.questionsQuery.sentinelRef}
          />
        </div>
      </section>
    </AppShell>
  );
}

function TaxonomyEditor({
  title,
  axis,
  values,
  onCreate,
  onRename,
  onDelete,
  onReorder,
}: {
  title: string;
  axis: ForumAxis;
  values: ForumTaxonomyValue[];
  onCreate: (axis: ForumAxis, label: string) => void;
  onRename: (axis: ForumAxis, id: string, label: string) => void;
  onDelete: (axis: ForumAxis, id: string) => void;
  onReorder: (axis: ForumAxis, id: string, direction: "up" | "down") => void;
}) {
  const [newLabel, setNewLabel] = useState("");

  const add = () => {
    if (!newLabel.trim()) return;
    onCreate(axis, newLabel);
    setNewLabel("");
  };

  return (
    <div className="card">
      <h3 className="u-mt-0">{title}</h3>
      <div className="forum-admin-tax-list">
        {values.length === 0 ? (
          <p className="page-subtitle">Значений пока нет.</p>
        ) : (
          values.map((value, index) => (
            <TaxonomyRow
              key={value.id}
              value={value}
              isFirst={index === 0}
              isLast={index === values.length - 1}
              onRename={(label) => onRename(axis, value.id, label)}
              onDelete={() => onDelete(axis, value.id)}
              onMoveUp={() => onReorder(axis, value.id, "up")}
              onMoveDown={() => onReorder(axis, value.id, "down")}
            />
          ))
        )}
      </div>
      <div className="forum-report__row u-mt-12">
        <input
          className="input"
          value={newLabel}
          maxLength={80}
          onChange={(event) => setNewLabel(event.target.value)}
          placeholder="Новое значение"
        />
        <button type="button" className="button" onClick={add} disabled={!newLabel.trim()}>
          Добавить
        </button>
      </div>
    </div>
  );
}

function TaxonomyRow({
  value,
  isFirst,
  isLast,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  value: ForumTaxonomyValue;
  isFirst: boolean;
  isLast: boolean;
  onRename: (label: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.label);

  if (editing) {
    return (
      <div className="forum-admin-tax-row is-editing">
        <input className="input" value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} />
        <div className="forum-report__row">
          <button
            type="button"
            className="button"
            onClick={() => {
              if (draft.trim()) onRename(draft);
              setEditing(false);
            }}
          >
            Сохранить
          </button>
          <button type="button" className="forum-text-button" onClick={() => setEditing(false)}>
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="forum-admin-tax-row">
      <div className="forum-admin-tax-reorder">
        <button type="button" aria-label="Выше" disabled={isFirst} onClick={onMoveUp}>
          <MoveUp size={14} />
        </button>
        <button type="button" aria-label="Ниже" disabled={isLast} onClick={onMoveDown}>
          <MoveDown size={14} />
        </button>
      </div>
      <span className="forum-admin-tax-label">{value.label}</span>
      <div className="forum-answer-actions">
        <button type="button" className="forum-text-button" onClick={() => setEditing(true)}>
          <Pencil size={15} /> Изменить
        </button>
        <button type="button" className="forum-text-button is-danger" onClick={onDelete}>
          <Trash2 size={15} /> Удалить
        </button>
      </div>
    </div>
  );
}

function SeedForm({
  disabled,
  rawMaterials,
  questionTypes,
  onSeed,
}: {
  disabled: boolean;
  rawMaterials: ForumTaxonomyValue[];
  questionTypes: ForumTaxonomyValue[];
  onSeed: (input: { title: string; body: string; rawMaterialId: string; questionTypeId: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [questionTypeId, setQuestionTypeId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !rawMaterialId || !questionTypeId) return;
    setBusy(true);
    const ok = await onSeed({ title: title.trim(), body: body.trim(), rawMaterialId, questionTypeId });
    setBusy(false);
    if (ok) {
      setTitle("");
      setBody("");
      setRawMaterialId("");
      setQuestionTypeId("");
    }
  };

  return (
    <div className="card">
      <h3 className="u-mt-0">Засеять вопрос от лица команды</h3>
      {disabled ? (
        <p className="page-subtitle">Сначала добавьте хотя бы один вид сырья и один тип вопроса в справочниках выше.</p>
      ) : (
        <div className="forum-form forum-form--seed">
          <input
            className="input"
            value={title}
            maxLength={180}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Заголовок вопроса"
          />
          <textarea
            className="textarea"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Подробности (необязательно)"
          />
          <div className="forum-two">
            <select className="select" value={rawMaterialId} onChange={(event) => setRawMaterialId(event.target.value)}>
              <option value="">Вид сырья</option>
              {rawMaterials.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={questionTypeId}
              onChange={(event) => setQuestionTypeId(event.target.value)}
            >
              <option value="">Тип вопроса</option>
              {questionTypes.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              className="button"
              onClick={submit}
              disabled={busy || !title.trim() || !rawMaterialId || !questionTypeId}
            >
              Опубликовать вопрос
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

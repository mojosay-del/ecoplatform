"use client";
import "../../../styles/forum.css";

// CMS-экран «Форум»: управление справочниками (две оси), быстрая модерация
// вопросов и засев контента. Тонкий контейнер — состояние и операции в
// useAdminForum. Права инфорсит бэкенд; кнопки гейтятся по роли.

import { useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { ForumQuestionStatus, ForumTaxonomyValue } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { StatusBadge } from "../../forum/components";
import { relativeTime } from "../../forum/forum-helpers";
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

  if (forum.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Форум</h1>
          <p className="page-subtitle">Войдите как сотрудник платформы.</p>
        </section>
      </AppShell>
    );
  }
  if (forum.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Форум</h1>
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
        <header className="page-header">
          <h1 className="page-title">Форум</h1>
          <p className="page-subtitle">Справочники тегов, засев вопросов и модерация раздела «Форум».</p>
        </header>
        {forum.message ? <p className="cms-flash">{forum.message}</p> : null}

        {forum.canManageTaxonomy ? (
          <div className="forum-admin-grid">
            <TaxonomyEditor
              title="Вид сырья"
              axis="raw-materials"
              values={forum.taxonomy.rawMaterials}
              onCreate={forum.createValue}
              onRename={forum.renameValue}
              onDelete={forum.deleteValue}
            />
            <TaxonomyEditor
              title="Тип вопроса"
              axis="question-types"
              values={forum.taxonomy.questionTypes}
              onCreate={forum.createValue}
              onRename={forum.renameValue}
              onDelete={forum.deleteValue}
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
          <div className="forum-seg u-mb-14" role="group" aria-label="Фильтр по статусу">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                aria-pressed={forum.statusFilter === option.value}
                onClick={() => void forum.changeStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {forum.questions.length === 0 ? (
            <p className="page-subtitle">Вопросов нет.</p>
          ) : (
            <div className="forum-admin-q-list">
              {forum.questions.map((question) => (
                <div key={question.id} className="forum-admin-q-row">
                  <div className="forum-admin-q-main">
                    <div className="forum-tags">
                      <StatusBadge status={question.status} />
                      {question.rawMaterial ? <span className="forum-chip">{question.rawMaterial.label}</span> : null}
                      {question.questionType ? <span className="forum-chip">{question.questionType.label}</span> : null}
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
              ))}
            </div>
          )}
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
}: {
  title: string;
  axis: ForumAxis;
  values: ForumTaxonomyValue[];
  onCreate: (axis: ForumAxis, label: string) => void;
  onRename: (axis: ForumAxis, id: string, label: string) => void;
  onDelete: (axis: ForumAxis, id: string) => void;
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
          values.map((value) => (
            <TaxonomyRow
              key={value.id}
              value={value}
              onRename={(label) => onRename(axis, value.id, label)}
              onDelete={() => onDelete(axis, value.id)}
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
  onRename,
  onDelete,
}: {
  value: ForumTaxonomyValue;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.label);

  if (editing) {
    return (
      <div className="forum-admin-tax-row">
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
      <span>{value.label}</span>
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
        <p className="page-subtitle">Сначала добавьте хотя бы один вид сырья и один тип вопроса.</p>
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

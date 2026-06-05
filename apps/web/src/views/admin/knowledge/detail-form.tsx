"use client";

import type { FormEvent } from "react";
import type { Block } from "../../../lib/editor/block-types";
import { DocumentEditor } from "../../../components/editor/DocumentEditor";
import { FileUploadField } from "../../../components/FileUploadField";
import { KNOWLEDGE_ATOMIC_KINDS } from "./constants";
import type { Article, DraftState, KnowledgeAutosaveUi, SetKnowledgeDraft } from "./types";

export function KnowledgeDetailForm({
  draft,
  original,
  hasChanges,
  autosaveEnabled,
  submitting,
  isEditingNew,
  activeCategoryTitle,
  autosave,
  setDraft,
  onSubmit,
  onCancel,
  onRemove,
  onPublishToggle,
}: {
  draft: DraftState;
  original: Article | null;
  hasChanges: boolean;
  autosaveEnabled: boolean;
  submitting: boolean;
  isEditingNew: boolean;
  activeCategoryTitle: string | null;
  autosave: KnowledgeAutosaveUi;
  setDraft: SetKnowledgeDraft;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onRemove: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
}) {
  const saveStatusClass = autosaveEnabled ? `is-${autosave.autosaveState}` : hasChanges ? "has-changes" : "is-saved";
  const draftLabel = draft.kind === "category" ? "Категория" : "Материал";

  return (
    <form className="form news-form" onSubmit={onSubmit} onBlur={autosave.handleAutosaveBlur}>
      <div className="news-form-head">
        <span className="news-form-mode">{isEditingNew ? `Новый ${draftLabel.toLowerCase()}` : draftLabel}</span>
      </div>

      {draft.kind === "category" ? (
        <fieldset className="form-fieldset">
          <legend className="form-legend">Категория</legend>
          <label className="form-field">
            <span>Название</span>
            <input
              className="news-form-title"
              placeholder="Например: «Бумага и картон»"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Короткое описание</span>
            <input
              className="input"
              placeholder="Необязательно"
              value={draft.subtitle}
              onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>
        </fieldset>
      ) : (
        <>
          <div className="news-form-preview">
            <FileUploadField
              accept="image/*"
              buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
              imagePreset="cover"
              label="Обложка материала"
              value={draft.coverImageId}
              onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
            />
            <div className="news-form-copy">
              <span className="news-tile-category">{activeCategoryTitle ?? "Материал базы знаний"}</span>
              <input
                className="news-form-title"
                placeholder="Заголовок материала..."
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </div>
          </div>

          <label className="news-lead-field">
            <input
              className="news-form-lead"
              aria-label="Подзаголовок материала"
              placeholder="Подзаголовок материала"
              value={draft.subtitle}
              onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>

          <div className="form-field news-content-field">
            <span>Содержание материала</span>
            <DocumentEditor
              blocks={draft.blocks}
              onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks: blocks as Block[] }))}
              allowedAtomicKinds={KNOWLEDGE_ATOMIC_KINDS}
              placeholder="Текст статьи — пишите или нажмите «/» для вставки блока..."
            />
          </div>
        </>
      )}

      <div className="lesson-save-bar news-save-bar">
        <span className={`lesson-save-bar-status ${saveStatusClass}`}>
          {submitting
            ? "Сохраняется..."
            : autosaveEnabled
              ? autosave.autosaveLabel
              : hasChanges
                ? isEditingNew
                  ? "Новый черновик"
                  : "Есть несохранённые изменения"
                : "Сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          {!isEditingNew ? (
            <button className="button secondary" type="button" onClick={onCancel}>
              Отмена
            </button>
          ) : null}
          {!isEditingNew && original && draft.kind === "material" ? (
            <button className="button secondary danger" type="button" onClick={() => onRemove(original)}>
              Удалить публикацию
            </button>
          ) : null}
          {!isEditingNew && original ? (
            <button className="button secondary" type="button" onClick={() => onPublishToggle(original)}>
              {original.status === "published" ? "Снять с публикации" : "Опубликовать"}
            </button>
          ) : null}
          <button className="button" type="submit" disabled={submitting || autosave.isAutosaving || !hasChanges}>
            {submitting || autosave.isAutosaving ? "Сохраняется..." : isEditingNew ? "Создать черновик" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}

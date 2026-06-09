"use client";

import type { FocusEvent, FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import type { Block } from "../../../lib/editor/block-types";
import { DocumentEditor } from "../../../components/editor/DocumentEditor";
import { FileUploadField } from "../../../components/FileUploadField";
import { NEWS_ATOMIC_KINDS } from "./constants";
import { NewsTagPicker } from "./NewsTagPicker";
import type { DraftState, NewsDetail, TagSuggestion } from "./types";

type NewsEditorFormProps = {
  autosaveEnabled: boolean;
  autosaveLabel: string;
  canOpenSavedPreview: boolean;
  draft: DraftState;
  hasChanges: boolean;
  isAutosaving: boolean;
  isEditingNew: boolean;
  original: NewsDetail | null;
  saveStatusClass: string;
  submitting: boolean;
  tagDraft: string;
  tagSuggestionLabel: string;
  tagSuggestions: TagSuggestion[];
  onAddTag: (value: string) => void;
  onAutosaveBlur: (event: FocusEvent<HTMLElement>) => void;
  onDraftChange: (update: (prev: DraftState) => DraftState) => void;
  onPublishToggle: (item: NewsDetail) => void | Promise<void>;
  onRemove: (item: NewsDetail) => void | Promise<void>;
  onRemoveTag: (value: string) => void;
  onStartNew: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTagDraftChange: (value: string) => void;
  previewHref: (item: Pick<NewsDetail, "slug">) => string;
};

export function NewsEditorForm({
  autosaveEnabled,
  autosaveLabel,
  canOpenSavedPreview,
  draft,
  hasChanges,
  isAutosaving,
  isEditingNew,
  original,
  saveStatusClass,
  submitting,
  tagDraft,
  tagSuggestionLabel,
  tagSuggestions,
  onAddTag,
  onAutosaveBlur,
  onDraftChange,
  onPublishToggle,
  onRemove,
  onRemoveTag,
  onStartNew,
  onSubmit,
  onTagDraftChange,
  previewHref,
}: NewsEditorFormProps) {
  return (
    <form className="form news-form" onSubmit={onSubmit} onBlur={onAutosaveBlur}>
      <div className="news-form-head">
        <span className="news-form-mode">{isEditingNew ? "Новая новость" : "Редактирование"}</span>
      </div>

      <div className="news-form-preview">
        <FileUploadField
          accept="image/*"
          buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
          imagePreset="cover"
          label="Обложка новости"
          value={draft.coverImageId}
          onChange={(fileId) => onDraftChange((prev) => ({ ...prev, coverImageId: fileId }))}
        />
        <label className="form-field news-content-field">
          <span>Заголовок новости</span>
          <input
            className="news-form-lead education-module-title-input"
            placeholder="Введите заголовок новости…"
            value={draft.title}
            onChange={(event) => onDraftChange((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
        </label>
      </div>

      <label className="form-field news-content-field">
        <span>Подзаголовок</span>
        <input
          className="news-form-lead"
          aria-label="Подзаголовок новости"
          placeholder="Краткое содержание, 1–2 предложения"
          value={draft.lead}
          onChange={(event) => onDraftChange((prev) => ({ ...prev, lead: event.target.value }))}
          required
        />
      </label>

      <div className="form-field news-content-field">
        <span>Содержание новости</span>
        <DocumentEditor
          blocks={draft.blocks}
          onChange={(blocks) => onDraftChange((prev) => ({ ...prev, blocks: blocks as Block[] }))}
          allowedAtomicKinds={NEWS_ATOMIC_KINDS}
          placeholder="Текст новости — пишите или нажмите «/» для вставки блока…"
        />
      </div>

      <NewsTagPicker
        tags={draft.tags}
        tagDraft={tagDraft}
        tagSuggestions={tagSuggestions}
        tagSuggestionLabel={tagSuggestionLabel}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
        onTagDraftChange={onTagDraftChange}
      />

      <div className="lesson-save-bar news-save-bar">
        <span className={`lesson-save-bar-status ${saveStatusClass}`}>
          {submitting
            ? "Сохраняется…"
            : autosaveEnabled
              ? autosaveLabel
              : hasChanges
                ? isEditingNew
                  ? "Новый черновик"
                  : "Есть несохранённые изменения"
                : "Сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          {!isEditingNew ? (
            <button className="button secondary" type="button" onClick={onStartNew}>
              Отмена
            </button>
          ) : null}
          {!isEditingNew && original ? (
            <button className="button secondary" type="button" onClick={() => onPublishToggle(original)}>
              {original.status === "published" ? "Снять с публикации" : "Опубликовать"}
            </button>
          ) : null}
          {!isEditingNew && original ? (
            <button className="button secondary danger" type="button" onClick={() => onRemove(original)}>
              Удалить полностью
            </button>
          ) : null}
          {canOpenSavedPreview && original ? (
            <a
              className="button secondary"
              href={previewHref(original)}
              target="_blank"
              rel="noreferrer"
              title="Открыть публичный предпросмотр"
            >
              <ExternalLink size={14} />
              Предпросмотр
            </a>
          ) : (
            <button
              className="button secondary"
              type="button"
              disabled
              title="Сначала сохраните новость, чтобы открыть публичный предпросмотр"
            >
              <ExternalLink size={14} />
              Предпросмотр
            </button>
          )}
          <button className="button" type="submit" disabled={submitting || isAutosaving || !hasChanges}>
            {submitting || isAutosaving ? "Сохраняется…" : isEditingNew ? "Создать черновик" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}

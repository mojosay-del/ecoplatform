"use client";

import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Block } from "../../../lib/editor/block-types";
import { LazyDocumentEditor as DocumentEditor } from "../../../components/editor/LazyDocumentEditor";
import { FileUploadField } from "../../../components/FileUploadField";
import { KNOWLEDGE_ATOMIC_KINDS } from "./constants";
import { KnowledgeIconPicker } from "./icon-picker";
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
  onAddMaterial,
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
  onAddMaterial: (categoryId: string) => void;
  onRemove: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
}) {
  const saveStatusClass = autosaveEnabled ? `is-${autosave.autosaveState}` : hasChanges ? "has-changes" : "is-saved";
  const draftLabel = draft.kind === "category" ? "Категория" : "Материал";

  return (
    <form className="form news-form" onSubmit={onSubmit} onBlur={autosave.handleAutosaveBlur}>
      <div className="news-form-head">
        <span className="news-form-mode">
          {isEditingNew ? `Новый ${draftLabel.toLowerCase()}` : draftLabel}
          {draft.kind === "material" && activeCategoryTitle ? ` · ${activeCategoryTitle}` : ""}
        </span>
      </div>

      {draft.kind === "category" ? (
        <>
          <label className="form-field news-content-field">
            <span>Название</span>
            <input
              className="news-form-lead education-module-title-input"
              placeholder="Например: «Бумага и картон»"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>

          <label className="form-field news-content-field">
            <span>Короткое описание</span>
            <input
              className="news-form-lead"
              placeholder="Необязательно"
              value={draft.subtitle}
              onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>

          <div className="form-field news-content-field">
            <span>Иконка раздела</span>
            <KnowledgeIconPicker
              value={draft.displayIcon}
              onChange={(displayIcon) => setDraft((prev) => ({ ...prev, displayIcon }))}
            />
          </div>
        </>
      ) : (
        <>
          <label className="form-field news-content-field">
            <span>Название материала</span>
            <input
              className="news-form-lead education-module-title-input"
              placeholder="Заголовок материала..."
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>

          <label className="form-field news-content-field">
            <span>Код номенклатуры</span>
            <input
              className="news-form-lead"
              placeholder="Например: МС-5Б"
              value={draft.subtitle}
              onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>

          <div className="form-field news-content-field">
            <span>Иконка подраздела</span>
            <KnowledgeIconPicker
              value={draft.displayIcon}
              onChange={(displayIcon) => setDraft((prev) => ({ ...prev, displayIcon }))}
            />
          </div>

          <div className="form-field news-content-field news-form-preview">
            <span>Обложка материала</span>
            <FileUploadField
              accept="image/*"
              buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
              hideLabel
              imagePreset="cover"
              label="Обложка материала"
              value={draft.coverImageId}
              onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
            />
          </div>

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
          {!isEditingNew && original && draft.kind === "category" ? (
            <button className="button secondary" type="button" onClick={() => onAddMaterial(original.id)}>
              <Plus size={14} />
              Материал
            </button>
          ) : null}
          {!isEditingNew && original && draft.kind === "category" ? (
            <button className="button secondary danger" type="button" onClick={() => onRemove(original)}>
              <Trash2 size={14} />
              Удалить категорию
            </button>
          ) : null}
          {!isEditingNew && original && draft.kind === "material" ? (
            <button className="button secondary danger" type="button" onClick={() => onRemove(original)}>
              <Trash2 size={14} />
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

"use client";

import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Block } from "../../../lib/editor/block-types";
import { DocumentEditor } from "../../../components/editor/DocumentEditor";
import { FileUploadField } from "../../../components/FileUploadField";
import { DOCUMENT_FILE_ACCEPT, DOCUMENTATION_ATOMIC_KINDS } from "./constants";
import { DocumentationIconPicker } from "./icon-picker";
import type { DocArticle, DocAutosaveUi, DocDraftState, SetDocDraft } from "./types";

export function DocDetailForm({
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
  onAddDocument,
  onRemove,
  onPublishToggle,
}: {
  draft: DocDraftState;
  original: DocArticle | null;
  hasChanges: boolean;
  autosaveEnabled: boolean;
  submitting: boolean;
  isEditingNew: boolean;
  activeCategoryTitle: string | null;
  autosave: DocAutosaveUi;
  setDraft: SetDocDraft;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onAddDocument: (categoryId: string) => void;
  onRemove: (article: DocArticle) => void;
  onPublishToggle: (article: DocArticle) => void;
}) {
  const saveStatusClass = autosaveEnabled ? `is-${autosave.autosaveState}` : hasChanges ? "has-changes" : "is-saved";
  const draftLabel = draft.kind === "category" ? "Раздел" : "Документ";
  const isPublished = original?.status === "published";

  return (
    <form className="form news-form" onSubmit={onSubmit} onBlur={autosave.handleAutosaveBlur}>
      <div className="news-form-head">
        <span className="news-form-mode">
          {isEditingNew ? `Новый ${draftLabel.toLowerCase()}` : draftLabel}
          {draft.kind === "document" && activeCategoryTitle ? ` · ${activeCategoryTitle}` : ""}
        </span>
      </div>

      {draft.kind === "category" ? (
        <>
          <label className="form-field news-content-field">
            <span>Название</span>
            <input
              className="news-form-lead education-module-title-input"
              placeholder="Например: «Шаблоны договоров»"
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
            <DocumentationIconPicker
              value={draft.displayIcon}
              onChange={(displayIcon) => setDraft((prev) => ({ ...prev, displayIcon }))}
            />
          </div>
        </>
      ) : (
        <>
          <label className="form-field news-content-field">
            <span>Название документа</span>
            <input
              className="news-form-lead education-module-title-input"
              placeholder="Например: «Договор поставки вторсырья»"
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              required
            />
          </label>

          <label className="form-field news-content-field">
            <span>Короткий дескриптор</span>
            <input
              className="news-form-lead"
              placeholder="Строка под заголовком на карточке"
              value={draft.subtitle}
              onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
            />
          </label>

          <div className="form-field news-content-field">
            <span>Файл документа</span>
            <FileUploadField
              accept={DOCUMENT_FILE_ACCEPT}
              accessLevel="platform_private"
              buttonLabel={draft.fileAssetId ? "Заменить файл" : "Загрузить файл"}
              hideLabel
              label="Файл документа"
              value={draft.fileAssetId}
              onChange={(fileId) => setDraft((prev) => ({ ...prev, fileAssetId: fileId }))}
            />
          </div>

          <div className="doc-form-row">
            <label className="form-field news-content-field">
              <span>Версия</span>
              <input
                className="news-form-lead"
                placeholder="Например: 2.1"
                value={draft.version}
                onChange={(event) => setDraft((prev) => ({ ...prev, version: event.target.value }))}
              />
            </label>
            <label className="form-field news-content-field">
              <span>Действует с</span>
              <input
                className="news-form-lead"
                type="date"
                value={draft.effectiveDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, effectiveDate: event.target.value }))}
              />
            </label>
          </div>

          <label className="doc-form-check">
            <input
              type="checkbox"
              checked={draft.isPinned}
              onChange={(event) => setDraft((prev) => ({ ...prev, isPinned: event.target.checked }))}
            />
            <span>Закрепить в «Часто нужные»</span>
          </label>

          {isPublished ? (
            <label className="doc-form-check">
              <input
                type="checkbox"
                checked={draft.markRevised}
                onChange={(event) => setDraft((prev) => ({ ...prev, markRevised: event.target.checked }))}
              />
              <span>Отметить как обновление (бейдж «Обновлено» и подъём в ленте)</span>
            </label>
          ) : null}

          <div className="form-field news-content-field">
            <span>Описание документа</span>
            <DocumentEditor
              blocks={draft.blocks}
              onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks: blocks as Block[] }))}
              allowedAtomicKinds={DOCUMENTATION_ATOMIC_KINDS}
              placeholder="Опишите документ — что внутри, как заполнять. «/» вставляет блок..."
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
            <button className="button secondary" type="button" onClick={() => onAddDocument(original.id)}>
              <Plus size={14} />
              Документ
            </button>
          ) : null}
          {!isEditingNew && original ? (
            <button className="button secondary danger" type="button" onClick={() => onRemove(original)}>
              <Trash2 size={14} />
              {draft.kind === "category" ? "Удалить раздел" : "Удалить документ"}
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

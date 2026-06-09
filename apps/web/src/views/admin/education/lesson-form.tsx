"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ClipboardList, ExternalLink, Paperclip, Plus, Trash2 } from "lucide-react";
import type { Block } from "../../../lib/editor/block-types";
import { canonicalizeBlocks } from "../../../lib/editor/serializer";
import { DocumentEditor } from "../../../components/editor/DocumentEditor";
import { FileUploadField } from "../../../components/FileUploadField";
import { canAutosaveDraft, useCmsAutosave, useUnsavedChangesWarning } from "../../../lib/cms-autosave";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { LESSON_ATOMIC_KINDS } from "./constants";
import type {
  Attachment,
  EducationMutation,
  Lesson,
  LessonDraft,
  LessonTaskDraft,
  SetEducationSelection,
} from "./types";
import { lessonToDraft, normalizeLessonDraft } from "./utils";

export function LessonForm({
  lesson,
  moduleId,
  onMutate,
  onSelect,
}: {
  lesson: Lesson;
  moduleId: string | null;
  onMutate: EducationMutation;
  onSelect: SetEducationSelection;
}) {
  const [draft, setDraft] = useState<LessonDraft>(() => lessonToDraft(lesson));
  const [savedDraft, setSavedDraft] = useState(() => normalizeLessonDraft(lessonToDraft(lesson)));
  const [attachmentsBlockVisible, setAttachmentsBlockVisible] = useState(lesson.attachments.length > 0);
  const [saving, setSaving] = useState(false);
  const normalizedDraft = useMemo(() => normalizeLessonDraft(draft), [draft]);

  // Черновик пересинхронизируем только при переключении на другой урок, а
  // "последнюю сохранённую версию" обновляем на каждый refetch. Так refetch
  // после автосейва не затирает текст, набранный во время сохранения, но
  // индикатор "Не сохранено" честно гаснет, когда сервер вернул ровно текущий
  // черновик.
  const loadedLessonIdRef = useRef(lesson.id);
  useEffect(() => {
    const nextSavedDraft = normalizeLessonDraft(lessonToDraft(lesson));
    setSavedDraft(nextSavedDraft);
    if (loadedLessonIdRef.current === lesson.id) return;
    loadedLessonIdRef.current = lesson.id;
    setDraft(lessonToDraft(lesson));
    setAttachmentsBlockVisible(lesson.attachments.length > 0);
  }, [lesson]);

  const persistLessonDraft = useCallback(async () => {
    const savedSnapshot = normalizedDraft;
    const ok = await onMutate(`/admin/content/education/lessons/${lesson.id}`, "PATCH", {
      title: savedSnapshot.title,
      coverImageId: savedSnapshot.coverImageId || null,
      coverSubtitle: savedSnapshot.coverSubtitle || null,
      blocks: savedSnapshot.blocks,
      attachments: savedSnapshot.attachments,
    });
    if (!ok) throw new Error("Не удалось сохранить урок.");
    setSavedDraft(savedSnapshot);
  }, [lesson.id, normalizedDraft, onMutate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await persistLessonDraft().catch(() => undefined);
    setSaving(false);
  }

  function addAttachment() {
    setDraft((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { fileId: "", displayName: "" }],
    }));
  }

  function addAttachmentsBlock() {
    setAttachmentsBlockVisible(true);
    if (draft.attachments.length === 0) {
      addAttachment();
    }
  }

  function addLessonTask() {
    setDraft((prev) => ({
      ...prev,
      lessonTasks: [...prev.lessonTasks, { title: "", description: "" }],
    }));
  }

  function updateLessonTask(index: number, patch: Partial<LessonTaskDraft>) {
    setDraft((prev) => ({
      ...prev,
      lessonTasks: prev.lessonTasks.map((task, idx) => (idx === index ? { ...task, ...patch } : task)),
    }));
  }

  function removeLessonTask(index: number) {
    setDraft((prev) => ({
      ...prev,
      lessonTasks: prev.lessonTasks.filter((_, idx) => idx !== index),
    }));
  }

  function updateAttachment(index: number, patch: Partial<Attachment>) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.map((attachment, idx) =>
        idx === index ? { ...attachment, ...patch } : attachment,
      ),
    }));
  }

  function removeAttachment(index: number) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, idx) => idx !== index),
    }));
    if (draft.attachments.length <= 1) {
      setAttachmentsBlockVisible(false);
    }
  }

  async function publishToggle() {
    // Сначала сохраняем текущий черновик: иначе на сайт уйдёт последняя
    // автосохранённая версия, а свежие правки (которые ещё не успел подхватить
    // автосейв) потеряются. Именно из-за этого «публикую — теряю 5 минут».
    if (hasChanges) {
      setSaving(true);
      const saved = await persistLessonDraft()
        .then(() => true)
        .catch(() => false);
      setSaving(false);
      if (!saved) return;
    }
    const path =
      lesson.status === "published"
        ? `/admin/content/education/lessons/${lesson.id}/unpublish`
        : `/admin/content/education/lessons/${lesson.id}/publish`;
    await onMutate(path, "POST");
  }

  async function removeLesson() {
    if (!confirm(`Удалить урок «${lesson.title}»?`)) return;
    const ok = await onMutate(`/admin/content/education/lessons/${lesson.id}`, "DELETE");
    if (ok) onSelect({ kind: "chapter", id: lesson.chapterId });
  }

  // Сравниваем draft с последней сохранённой версией, чтобы refetch после
  // сохранения не залипал в состоянии "Не сохранено".
  const hasChanges = useMemo(() => {
    if (normalizedDraft.title !== savedDraft.title) return true;
    if (normalizedDraft.coverImageId !== savedDraft.coverImageId) return true;
    if (normalizedDraft.coverSubtitle !== savedDraft.coverSubtitle) return true;
    if (
      JSON.stringify(canonicalizeBlocks(normalizedDraft.blocks)) !==
      JSON.stringify(canonicalizeBlocks(savedDraft.blocks))
    )
      return true;
    if (JSON.stringify(normalizedDraft.attachments) !== JSON.stringify(savedDraft.attachments)) return true;
    return false;
  }, [normalizedDraft, savedDraft]);

  const lessonAutosave = useCmsAutosave({
    enabled: canAutosaveDraft(lesson.status, lesson.id) && !saving,
    hasChanges,
    onSave: persistLessonDraft,
  });
  const saveStatusClass =
    lessonAutosave.autosaveState === "dirty" ? "has-changes" : `is-${lessonAutosave.autosaveState}`;

  useUnsavedChangesWarning(hasChanges);

  return (
    <form className="form lesson-form" onSubmit={submit} onBlur={lessonAutosave.handleAutosaveBlur}>
      <header className="lesson-header">
        <span className={`lesson-header-status${lesson.status === "published" ? " is-published" : ""}`}>
          {CONTENT_STATUS_LABELS[lesson.status]}
        </span>
      </header>

      <section className="lesson-section lesson-cover-section">
        <label className="form-field news-content-field">
          <span>Название урока</span>
          <input
            className="news-form-lead education-module-title-input"
            value={draft.title}
            placeholder="Введите название урока…"
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            required
          />
        </label>
        <label className="form-field news-content-field lesson-cover-subtitle-field">
          <span>Подзаголовок</span>
          <input
            className="news-form-lead"
            aria-label="Подзаголовок на обложке"
            value={draft.coverSubtitle}
            placeholder="Подзаголовок на обложке"
            maxLength={120}
            onChange={(event) => setDraft((prev) => ({ ...prev, coverSubtitle: event.target.value }))}
          />
        </label>
        <div className="form-field news-content-field lesson-cover-upload-field">
          <h3 className="lesson-section-title">Обложка урока</h3>
          <FileUploadField
            accept="image/*"
            buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
            hideLabel
            imagePreset="cover"
            label="Обложка урока"
            value={draft.coverImageId}
            onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
          />
        </div>
      </section>

      <section className="lesson-section">
        <h3 className="lesson-section-title">Содержание</h3>
        <DocumentEditor
          blocks={draft.blocks}
          onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks: blocks as Block[] }))}
          allowedAtomicKinds={LESSON_ATOMIC_KINDS}
          placeholder="Текст урока — пишите или нажмите «/» для вставки блока…"
        />
      </section>

      <section className="lesson-section lesson-tasks-section">
        <div className="lesson-section-heading-row">
          <h3 className="lesson-section-title lesson-section-title-with-icon">
            <ClipboardList size={16} />
            Задания урока
          </h3>
          {draft.lessonTasks.length > 0 ? (
            <span className="lesson-section-counter">Задач: {draft.lessonTasks.length}</span>
          ) : null}
        </div>
        <div className="lesson-tasks-editor">
          {draft.lessonTasks.length > 0 ? (
            <ol className="lesson-task-editor-list">
              {draft.lessonTasks.map((task, index) => (
                <li className="lesson-task-editor-row" key={index}>
                  <span className="lesson-task-editor-index">{index + 1}</span>
                  <div className="lesson-task-editor-fields">
                    <input
                      className="input"
                      aria-label={`Название задачи ${index + 1}`}
                      placeholder="Название задачи"
                      value={task.title}
                      onChange={(event) => updateLessonTask(index, { title: event.target.value })}
                    />
                    <input
                      className="input"
                      aria-label={`Подсказка к задаче ${index + 1}`}
                      placeholder="Подсказка (необязательно)"
                      value={task.description}
                      onChange={(event) => updateLessonTask(index, { description: event.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="attachment-delete lesson-task-delete"
                    onClick={() => removeLessonTask(index)}
                    title="Удалить задачу"
                    aria-label={`Удалить задачу ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="lesson-task-empty">Задачи не добавлены</div>
          )}
          <button type="button" className="attachments-add lesson-task-add" onClick={addLessonTask}>
            <Plus size={14} /> Добавить задачу
          </button>
        </div>
      </section>

      {!attachmentsBlockVisible ? (
        <button type="button" className="button secondary lesson-attach-reveal" onClick={addAttachmentsBlock}>
          <Paperclip size={14} /> Прикреплённые файлы
        </button>
      ) : null}

      {attachmentsBlockVisible ? (
        <section className="lesson-section">
          <h3 className="lesson-section-title">Прикреплённые файлы</h3>
          <div className="attachments">
            <ul className="attachments-list">
              {draft.attachments.map((attachment, index) => (
                <li className="attachment-row" key={index}>
                  <Paperclip size={16} className="attachment-icon" />
                  <div className="attachment-fields">
                    <FileUploadField
                      buttonLabel={attachment.fileId ? "Заменить файл" : "Загрузить файл"}
                      hideLabel
                      compact
                      // Вложения уроков — приватные: уходят в приватный бакет и
                      // отдаются ученику только presigned-ссылкой за paywall.
                      accessLevel="authenticated"
                      value={attachment.fileId}
                      onChange={(fileId, asset) =>
                        updateAttachment(index, {
                          fileId,
                          displayName: attachment.displayName || asset?.originalName || "",
                        })
                      }
                    />
                    <input
                      className="attachment-name-input"
                      placeholder="Отображаемое имя"
                      value={attachment.displayName}
                      onChange={(event) => updateAttachment(index, { displayName: event.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="attachment-delete"
                    onClick={() => removeAttachment(index)}
                    title="Удалить файл"
                    aria-label="Удалить файл"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="attachments-add" onClick={addAttachment}>
              <Plus size={14} /> Добавить файл
            </button>
          </div>
        </section>
      ) : null}

      <div className="lesson-save-bar news-save-bar education-detail-save-bar">
        <span className={`lesson-save-bar-status ${saveStatusClass}`}>
          {saving ? "Сохраняется…" : lessonAutosave.autosaveLabel}
        </span>
        <div className="lesson-save-bar-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => onSelect({ kind: "chapter", id: lesson.chapterId })}
          >
            К главе
          </button>
          <button className="button secondary danger" type="button" onClick={removeLesson}>
            <Trash2 size={14} />
            Удалить
          </button>
          <button className="button secondary" type="button" onClick={publishToggle}>
            {lesson.status === "published" ? "Снять с публикации" : "Опубликовать"}
          </button>
          {moduleId && !hasChanges ? (
            <a
              className="button secondary"
              href={`/education/${encodeURIComponent(moduleId)}/${encodeURIComponent(lesson.id)}?preview=1`}
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
              title={!moduleId ? "Модуль не найден" : "Сначала сохраните урок, чтобы открыть публичный предпросмотр"}
            >
              <ExternalLink size={14} />
              Предпросмотр
            </button>
          )}
          <button className="button" type="submit" disabled={saving || lessonAutosave.isAutosaving || !hasChanges}>
            {saving || lessonAutosave.isAutosaving ? "Сохраняется…" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Chapter, EducationMutation, LearningModule, SetEducationSelection } from "./types";

export function ChapterForm({
  chapter,
  module,
  onMutate,
  onSelect,
}: {
  chapter: Chapter;
  module: LearningModule;
  onMutate: EducationMutation;
  onSelect: SetEducationSelection;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [saving, setSaving] = useState(false);
  const hasChanges = title !== chapter.title;

  useEffect(() => {
    setTitle(chapter.title);
  }, [chapter.id, chapter.title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onMutate(`/admin/content/education/chapters/${chapter.id}`, "PATCH", { title });
    } finally {
      setSaving(false);
    }
  }

  async function addLesson() {
    await onMutate(`/admin/content/education/chapters/${chapter.id}/lessons`, "POST", {
      title: `Урок ${chapter.lessons.length + 1}`,
      position: chapter.lessons.length,
      blocks: [],
      attachments: [],
    });
  }

  async function removeChapter() {
    if (!confirm(`Удалить главу «${chapter.title}»?`)) return;
    const ok = await onMutate(`/admin/content/education/chapters/${chapter.id}`, "DELETE");
    if (ok) onSelect({ kind: "module", id: module.id });
  }

  return (
    <form className="form news-form education-detail-form" onSubmit={submit}>
      <div className="news-form-head">
        <span className="news-form-mode">Глава</span>
      </div>
      <label className="form-field news-content-field">
        <span>Название главы</span>
        <input
          className="news-form-lead education-module-title-input"
          value={title}
          placeholder="Введите название главы…"
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <div className="lesson-save-bar news-save-bar education-detail-save-bar">
        <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : " is-saved"}`}>
          {saving ? "Сохраняю…" : hasChanges ? "Есть несохранённые изменения" : "Сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          <button className="button secondary" type="button" onClick={addLesson}>
            <Plus size={14} />
            Урок
          </button>
          <button className="button secondary danger" type="button" onClick={removeChapter}>
            <Trash2 size={14} />
            Удалить
          </button>
          <button className="button" type="submit" disabled={!hasChanges || saving}>
            {saving ? "Сохраняю…" : "Сохранить главу"}
          </button>
        </div>
      </div>
    </form>
  );
}

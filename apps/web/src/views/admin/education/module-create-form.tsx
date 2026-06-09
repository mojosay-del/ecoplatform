"use client";

import { useState, type FormEvent } from "react";
import { FileUploadField } from "../../../components/FileUploadField";
import { LEARNING_ACCESS_LEVEL_LABELS } from "../../../lib/display-labels";
import type { EducationMutation, LearningModule } from "./types";

export function ModuleCreateForm({ onMutate, onClose }: { onMutate: EducationMutation; onClose: () => void }) {
  const [draft, setDraft] = useState({
    title: "",
    summary: "",
    description: "",
    coverImageId: "",
    accessLevel: "basic" as LearningModule["accessLevel"],
    isInDevelopment: false,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await onMutate("/admin/content/education/modules", "POST", {
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      coverImageId: draft.coverImageId.trim() || undefined,
      accessLevel: draft.accessLevel,
      isInDevelopment: draft.isInDevelopment,
      preview: { promotionalDescription: draft.summary, whatYouWillLearn: [] },
      chapters: [],
    });
    if (ok) onClose();
  }

  return (
    <form className="card form news-form" onSubmit={submit}>
      <div className="news-form-head">
        <span className="news-form-mode">Новый модуль</span>
      </div>
      <div className="news-form-preview">
        <FileUploadField
          accept="image/*"
          buttonLabel="Загрузить обложку"
          imagePreset="cover"
          label="Обложка модуля"
          value={draft.coverImageId}
          onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
        />
      </div>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-lead education-module-title-input"
          placeholder="Название модуля…"
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
          value={draft.title}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Краткое описание</span>
        <input
          className="news-form-lead"
          placeholder="Краткое описание"
          onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
          required
          value={draft.summary}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Полное описание</span>
        <input
          className="news-form-lead"
          placeholder="Полное описание"
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          required
          value={draft.description}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Уровень доступа</span>
        <select
          className="select"
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              accessLevel: event.target.value as LearningModule["accessLevel"],
            }))
          }
          value={draft.accessLevel}
        >
          <option value="basic">{LEARNING_ACCESS_LEVEL_LABELS.basic}</option>
          <option value="extended">{LEARNING_ACCESS_LEVEL_LABELS.extended}</option>
          <option value="one_time">{LEARNING_ACCESS_LEVEL_LABELS.one_time}</option>
        </select>
      </label>
      <label className="module-development-toggle">
        <input
          checked={draft.isInDevelopment}
          onChange={(event) => setDraft((prev) => ({ ...prev, isInDevelopment: event.target.checked }))}
          type="checkbox"
        />
        <span className="module-development-toggle-track" aria-hidden="true" />
        <span>В разработке</span>
      </label>
      <button className="button" type="submit">
        Создать модуль
      </button>
    </form>
  );
}

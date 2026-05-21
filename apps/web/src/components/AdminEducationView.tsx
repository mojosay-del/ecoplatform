"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { Block, BlocksEditor, LESSON_BLOCK_KINDS } from "./BlocksEditor";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type Attachment = { fileId: string; displayName: string };

type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  position: number;
  status: "draft" | "published";
  blocks: Block[];
  attachments: Attachment[];
};

type Chapter = {
  id: string;
  moduleId: string;
  title: string;
  position: number;
  lessons: Lesson[];
};

type Preview = { promotionalDescription: string; whatYouWillLearn: string[] };

type LearningModule = {
  id: string;
  title: string;
  summary: string;
  description: string;
  coverImageId: string | null;
  accessLevel: "basic" | "extended" | "one_time";
  oneTimePrice: number | null;
  status: "draft" | "published";
  preview: Preview | null;
  chapters: Chapter[];
};

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type Selection =
  | { kind: "none" }
  | { kind: "module"; id: string }
  | { kind: "chapter"; id: string }
  | { kind: "lesson"; id: string };

export function AdminEducationView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<LearningModule[]>("/admin/content/education", { token });
      setModules(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить курсы");
    }
  }

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    if (!token) return false;
    setMessage(null);
    try {
      await apiFetch(path, { method, token, body });
      await loadAll();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
      return false;
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedModule = useMemo(() => {
    if (selection.kind === "module") return modules.find((m) => m.id === selection.id) ?? null;
    if (selection.kind === "chapter") {
      const chapter = findChapter(modules, selection.id);
      return chapter ? modules.find((m) => m.id === chapter.moduleId) ?? null : null;
    }
    if (selection.kind === "lesson") {
      const lesson = findLesson(modules, selection.id);
      if (!lesson) return null;
      const chapter = findChapter(modules, lesson.chapterId);
      return chapter ? modules.find((m) => m.id === chapter.moduleId) ?? null : null;
    }
    return null;
  }, [modules, selection]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Модули, главы и уроки. Структура справа — детали слева.</p>
        </header>
        {message ? <p className="status-pill">{message}</p> : null}

        <div className="moderation-layout">
          <div className="stack-list">
            <ModulesList
              modules={modules}
              selection={selection}
              onSelect={setSelection}
              onMutate={mutate}
            />
          </div>
          <div className="moderation-detail">
            <DetailPanel
              selection={selection}
              modules={modules}
              onSelect={setSelection}
              onMutate={mutate}
            />
          </div>
        </div>
        {selectedModule ? <p className="page-subtitle">Контекст: {selectedModule.title}</p> : null}
      </section>
    </AppShell>
  );
}

function ModulesList({
  modules,
  selection,
  onSelect,
  onMutate,
}: {
  modules: LearningModule[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  async function createModule() {
    const body = {
      title: "Новый модуль",
      summary: "Краткое описание модуля",
      description: "Полное описание модуля",
      accessLevel: "basic" as const,
      preview: { promotionalDescription: "Что внутри", whatYouWillLearn: [] },
      chapters: [],
    };
    await onMutate("/admin/content/education/modules", "POST", body);
  }

  async function publishToggle(module: LearningModule) {
    const path =
      module.status === "published"
        ? `/admin/content/education/modules/${module.id}/unpublish`
        : `/admin/content/education/modules/${module.id}/publish`;
    await onMutate(path, "POST");
  }

  async function removeModule(module: LearningModule) {
    if (!confirm(`Удалить модуль «${module.title}»? Все главы и уроки будут удалены.`)) return;
    await onMutate(`/admin/content/education/modules/${module.id}`, "DELETE");
  }

  return (
    <>
      <div className="auth-actions">
        <button className="button" type="button" onClick={createModule}>
          + Новый модуль
        </button>
      </div>
      {modules.length === 0 ? <p className="page-subtitle">Модулей пока нет.</p> : null}
      {modules.map((module) => (
        <article
          key={module.id}
          className={`moderation-case-row ${
            selection.kind === "module" && selection.id === module.id ? "active" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect({ kind: "module", id: module.id })}
            style={{ all: "unset", cursor: "pointer", width: "100%" }}
          >
            <span className="status-pill">{module.status === "published" ? "Опубликован" : "Черновик"}</span>
            <strong style={{ display: "block", marginTop: 4 }}>{module.title}</strong>
            <small>
              Доступ: {module.accessLevel} · Глав: {module.chapters.length}
            </small>
          </button>
          <div className="auth-actions" style={{ marginTop: 6 }}>
            <button className="button secondary" type="button" onClick={() => publishToggle(module)}>
              {module.status === "published" ? "Снять" : "Опубликовать"}
            </button>
            <button className="button secondary" type="button" onClick={() => removeModule(module)}>
              Удалить
            </button>
          </div>
          <ChaptersList module={module} selection={selection} onSelect={onSelect} onMutate={onMutate} />
        </article>
      ))}
    </>
  );
}

function ChaptersList({
  module,
  selection,
  onSelect,
  onMutate,
}: {
  module: LearningModule;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  async function addChapter() {
    await onMutate(`/admin/content/education/modules/${module.id}/chapters`, "POST", {
      title: `Глава ${module.chapters.length + 1}`,
      position: module.chapters.length,
    });
  }

  async function removeChapter(chapter: Chapter) {
    if (!confirm(`Удалить главу «${chapter.title}»?`)) return;
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "DELETE");
  }

  return (
    <div className="stack-list" style={{ marginTop: 8, paddingLeft: 12 }}>
      {module.chapters.map((chapter) => (
        <div key={chapter.id}>
          <article
            className={`moderation-case-row ${
              selection.kind === "chapter" && selection.id === chapter.id ? "active" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect({ kind: "chapter", id: chapter.id })}
              style={{ all: "unset", cursor: "pointer", width: "100%" }}
            >
              <strong>{chapter.title}</strong>
              <small style={{ display: "block" }}>
                Уроков: {chapter.lessons.length} · Позиция: {chapter.position}
              </small>
            </button>
            <div className="auth-actions" style={{ marginTop: 6 }}>
              <button className="button secondary" type="button" onClick={() => removeChapter(chapter)}>
                Удалить главу
              </button>
            </div>
          </article>
          <LessonsList chapter={chapter} selection={selection} onSelect={onSelect} onMutate={onMutate} />
        </div>
      ))}
      <button className="button secondary" type="button" onClick={addChapter}>
        + Глава
      </button>
    </div>
  );
}

function LessonsList({
  chapter,
  selection,
  onSelect,
  onMutate,
}: {
  chapter: Chapter;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  async function addLesson() {
    await onMutate(`/admin/content/education/chapters/${chapter.id}/lessons`, "POST", {
      title: `Урок ${chapter.lessons.length + 1}`,
      position: chapter.lessons.length,
      blocks: [],
      attachments: [],
    });
  }

  async function removeLesson(lesson: Lesson) {
    if (!confirm(`Удалить урок «${lesson.title}»?`)) return;
    await onMutate(`/admin/content/education/lessons/${lesson.id}`, "DELETE");
  }

  return (
    <div className="stack-list" style={{ marginTop: 6, paddingLeft: 12 }}>
      {chapter.lessons.map((lesson) => (
        <article
          key={lesson.id}
          className={`moderation-case-row ${
            selection.kind === "lesson" && selection.id === lesson.id ? "active" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect({ kind: "lesson", id: lesson.id })}
            style={{ all: "unset", cursor: "pointer", width: "100%" }}
          >
            <span className="status-pill">{lesson.status === "published" ? "Опубликован" : "Черновик"}</span>
            <strong style={{ display: "block", marginTop: 4 }}>{lesson.title}</strong>
            <small>
              Блоков: {lesson.blocks.length} · Файлов: {lesson.attachments.length}
            </small>
          </button>
          <div className="auth-actions" style={{ marginTop: 6 }}>
            <button className="button secondary" type="button" onClick={() => removeLesson(lesson)}>
              Удалить урок
            </button>
          </div>
        </article>
      ))}
      <button className="button secondary" type="button" onClick={addLesson}>
        + Урок
      </button>
    </div>
  );
}

function DetailPanel({
  selection,
  modules,
  onSelect,
  onMutate,
}: {
  selection: Selection;
  modules: LearningModule[];
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  if (selection.kind === "none") {
    return <p className="page-subtitle">Выберите модуль, главу или урок слева.</p>;
  }
  if (selection.kind === "module") {
    const module = modules.find((m) => m.id === selection.id);
    if (!module) return <p className="page-subtitle">Модуль не найден.</p>;
    return <ModuleForm module={module} onMutate={onMutate} />;
  }
  if (selection.kind === "chapter") {
    const chapter = findChapter(modules, selection.id);
    if (!chapter) return <p className="page-subtitle">Глава не найдена.</p>;
    return <ChapterForm chapter={chapter} onMutate={onMutate} />;
  }
  const lesson = findLesson(modules, selection.id);
  if (!lesson) return <p className="page-subtitle">Урок не найден.</p>;
  return <LessonForm lesson={lesson} onMutate={onMutate} onSelect={onSelect} />;
}

function ModuleForm({
  module,
  onMutate,
}: {
  module: LearningModule;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({
    title: module.title,
    summary: module.summary,
    description: module.description,
    coverImageId: module.coverImageId ?? "",
    accessLevel: module.accessLevel,
    oneTimePrice: module.oneTimePrice ?? 0,
    promotionalDescription: module.preview?.promotionalDescription ?? "",
    whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
  });
  const [bullet, setBullet] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      title: module.title,
      summary: module.summary,
      description: module.description,
      coverImageId: module.coverImageId ?? "",
      accessLevel: module.accessLevel,
      oneTimePrice: module.oneTimePrice ?? 0,
      promotionalDescription: module.preview?.promotionalDescription ?? "",
      whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
    });
  }, [module.id, module.title, module.summary, module.description, module.coverImageId, module.accessLevel, module.oneTimePrice, module.preview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/modules/${module.id}`, "PATCH", {
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      coverImageId: draft.coverImageId.trim() || null,
      accessLevel: draft.accessLevel,
      oneTimePrice:
        draft.accessLevel === "one_time" && draft.oneTimePrice > 0 ? draft.oneTimePrice : null,
      preview: {
        promotionalDescription: draft.promotionalDescription,
        whatYouWillLearn: draft.whatYouWillLearn,
      },
    });
    setSaving(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Модуль</h2>
      <label className="form-field">
        <span>Название</span>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </label>
      <label className="form-field">
        <span>Краткое описание</span>
        <input
          className="input"
          value={draft.summary}
          onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
          required
        />
      </label>
      <label className="form-field">
        <span>Полное описание</span>
        <textarea
          className="textarea"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          rows={4}
          required
        />
      </label>
      <label className="form-field">
        <span>fileId обложки (необязательно)</span>
        <input
          className="input"
          value={draft.coverImageId}
          onChange={(event) => setDraft((prev) => ({ ...prev, coverImageId: event.target.value }))}
        />
      </label>
      <label className="form-field">
        <span>Уровень доступа</span>
        <select
          className="select"
          value={draft.accessLevel}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, accessLevel: event.target.value as "basic" | "extended" | "one_time" }))
          }
        >
          <option value="basic">basic — базовая подписка</option>
          <option value="extended">extended — расширенная подписка</option>
          <option value="one_time">one_time — разовая покупка</option>
        </select>
      </label>
      {draft.accessLevel === "one_time" ? (
        <label className="form-field">
          <span>Цена разовой покупки (рубли)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={draft.oneTimePrice}
            onChange={(event) => setDraft((prev) => ({ ...prev, oneTimePrice: Number(event.target.value) }))}
          />
        </label>
      ) : null}
      <label className="form-field">
        <span>Описание для превью (доступно без подписки)</span>
        <textarea
          className="textarea small"
          value={draft.promotionalDescription}
          onChange={(event) => setDraft((prev) => ({ ...prev, promotionalDescription: event.target.value }))}
          rows={3}
          required
        />
      </label>
      <div className="form-field">
        <span>Что узнает пользователь</span>
        <div className="stack-list">
          {draft.whatYouWillLearn.map((bulletItem, index) => (
            <div className="list-row" key={index}>
              <input
                className="input"
                value={bulletItem}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.map((item, idx) =>
                      idx === index ? event.target.value : item,
                    ),
                  }))
                }
                style={{ flex: 1 }}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.filter((_, idx) => idx !== index),
                  }))
                }
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <div className="list-row">
          <input
            className="input"
            placeholder="Новый пункт"
            value={bullet}
            onChange={(event) => setBullet(event.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              if (!bullet.trim()) return;
              setDraft((prev) => ({
                ...prev,
                whatYouWillLearn: [...prev.whatYouWillLearn, bullet.trim()],
              }));
              setBullet("");
            }}
          >
            + Пункт
          </button>
        </div>
      </div>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить модуль"}
      </button>
    </form>
  );
}

function ChapterForm({
  chapter,
  onMutate,
}: {
  chapter: Chapter;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [position, setPosition] = useState(chapter.position);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(chapter.title);
    setPosition(chapter.position);
  }, [chapter.id, chapter.title, chapter.position]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "PATCH", { title, position });
    setSaving(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Глава</h2>
      <label className="form-field">
        <span>Название</span>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className="form-field">
        <span>Позиция</span>
        <input
          className="input"
          type="number"
          min={0}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
        />
      </label>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить главу"}
      </button>
    </form>
  );
}

function LessonForm({
  lesson,
  onMutate,
  onSelect,
}: {
  lesson: Lesson;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onSelect: (s: Selection) => void;
}) {
  const [draft, setDraft] = useState({
    title: lesson.title,
    position: lesson.position,
    blocks: lesson.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    attachments: lesson.attachments.map((a) => ({ ...a })),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      title: lesson.title,
      position: lesson.position,
      blocks: lesson.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
      attachments: lesson.attachments.map((a) => ({ ...a })),
    });
  }, [lesson.id, lesson.title, lesson.position, lesson.blocks, lesson.attachments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/lessons/${lesson.id}`, "PATCH", {
      title: draft.title,
      position: draft.position,
      blocks: draft.blocks,
      attachments: draft.attachments,
    });
    setSaving(false);
  }

  function addAttachment() {
    setDraft((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { fileId: "", displayName: "" }],
    }));
  }
  function updateAttachment(index: number, patch: Partial<Attachment>) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.map((a, idx) => (idx === index ? { ...a, ...patch } : a)),
    }));
  }
  function removeAttachment(index: number) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, idx) => idx !== index),
    }));
  }

  async function publishToggle() {
    if (lesson.status === "published") {
      await onMutate(`/admin/content/education/lessons/${lesson.id}/unpublish`, "POST");
    }
    // публикация урока сейчас не на отдельном эндпойнте — публикуется через PATCH модуля
    // или вместе с модулем; в MVP ограничимся unpublish.
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Урок</h2>
      <label className="form-field">
        <span>Название</span>
        <input
          className="input"
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </label>
      <label className="form-field">
        <span>Позиция</span>
        <input
          className="input"
          type="number"
          min={0}
          value={draft.position}
          onChange={(event) => setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))}
        />
      </label>

      <div className="form-field">
        <span>Блоки контента</span>
        <BlocksEditor
          blocks={draft.blocks}
          onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks }))}
          allowedKinds={LESSON_BLOCK_KINDS}
        />
      </div>

      <div className="form-field">
        <span>Прикреплённые файлы</span>
        <div className="stack-list">
          {draft.attachments.map((attachment, index) => (
            <div className="list-row" key={index}>
              <div className="form" style={{ gap: 4, flex: 1 }}>
                <input
                  className="input"
                  placeholder="fileId"
                  value={attachment.fileId}
                  onChange={(event) => updateAttachment(index, { fileId: event.target.value })}
                />
                <input
                  className="input"
                  placeholder="Отображаемое имя"
                  value={attachment.displayName}
                  onChange={(event) => updateAttachment(index, { displayName: event.target.value })}
                />
              </div>
              <button className="button secondary" type="button" onClick={() => removeAttachment(index)}>
                Удалить
              </button>
            </div>
          ))}
          <button className="button secondary" type="button" onClick={addAttachment}>
            + Файл
          </button>
        </div>
      </div>

      <div className="auth-actions">
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Сохраняю…" : "Сохранить урок"}
        </button>
        {lesson.status === "published" ? (
          <button className="button secondary" type="button" onClick={publishToggle}>
            Снять с публикации
          </button>
        ) : null}
        <button
          className="button secondary"
          type="button"
          onClick={() => onSelect({ kind: "chapter", id: lesson.chapterId })}
        >
          К главе
        </button>
      </div>
    </form>
  );
}

function findChapter(modules: LearningModule[], chapterId: string): Chapter | null {
  for (const module of modules) {
    const chapter = module.chapters.find((c) => c.id === chapterId);
    if (chapter) return chapter;
  }
  return null;
}

function findLesson(modules: LearningModule[], lessonId: string): Lesson | null {
  for (const module of modules) {
    for (const chapter of module.chapters) {
      const lesson = chapter.lessons.find((l) => l.id === lessonId);
      if (lesson) return lesson;
    }
  }
  return null;
}

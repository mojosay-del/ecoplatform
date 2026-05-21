"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { Block, BlocksEditor, NEWS_BLOCK_KINDS } from "./BlocksEditor";
import { FileUploadField } from "./FileUploadField";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type NewsTag = {
  id: string;
  name: string;
};

type NewsItem = {
  id: string;
  title: string;
  lead: string;
  slug: string;
  status: "draft" | "published";
  coverImageId: string | null;
  blocks: Block[];
  tags: Array<{ newsTagId: string; newsTag: NewsTag }>;
  createdAt: string;
  updatedAt: string;
};

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type DraftState = {
  id: string | null;
  title: string;
  lead: string;
  coverImageId: string;
  tags: string[];
  blocks: Block[];
};

const EMPTY_DRAFT: DraftState = {
  id: null,
  title: "",
  lead: "",
  coverImageId: "",
  tags: [],
  blocks: [{ type: "paragraph", payload: { markdown: "" } }],
};

export function AdminNewsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Все теги, которые встречались в новостях — основа автокомплита.
  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const tag of item.tags) set.add(tag.newsTag.name);
    }
    return [...set].sort();
  }, [items]);

  const filteredSuggestions = useMemo(() => {
    if (!tagDraft.trim()) return [];
    const query = tagDraft.trim().toLowerCase();
    return knownTags.filter((tag) => tag.toLowerCase().includes(query) && !draft.tags.includes(tag)).slice(0, 8);
  }, [tagDraft, knownTags, draft.tags]);

  async function loadList() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<NewsItem[]>("/admin/content/news", { token });
      setItems(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить новости");
    }
  }

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setTagDraft("");
  }

  function startEdit(item: NewsItem) {
    setDraft({
      id: item.id,
      title: item.title,
      lead: item.lead,
      coverImageId: item.coverImageId ?? "",
      tags: item.tags.map((t) => t.newsTag.name),
      blocks: item.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    });
    setTagDraft("");
  }

  function addTag(value: string) {
    const clean = value.trim();
    if (!clean || draft.tags.includes(clean)) return;
    setDraft((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
    setTagDraft("");
  }

  function removeTag(value: string) {
    setDraft((prev) => ({ ...prev, tags: prev.tags.filter((tag) => tag !== value) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const body = {
        title: draft.title.trim(),
        lead: draft.lead.trim(),
        coverImageId: draft.coverImageId.trim() || undefined,
        tags: draft.tags,
        blocks: draft.blocks,
      };
      if (draft.id) {
        await apiFetch(`/admin/content/news/${draft.id}`, { method: "PATCH", token, body });
      } else {
        await apiFetch("/admin/content/news", { method: "POST", token, body });
      }
      setMessage(draft.id ? "Новость обновлена." : "Новость создана как черновик.");
      await loadList();
      if (!draft.id) startNew();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить новость.");
    } finally {
      setSubmitting(false);
    }
  }

  async function publishToggle(item: NewsItem) {
    if (!token) return;
    const path =
      item.status === "published"
        ? `/admin/content/news/${item.id}/unpublish`
        : `/admin/content/news/${item.id}/publish`;
    try {
      await apiFetch(path, { method: "POST", token });
      await loadList();
      setMessage(item.status === "published" ? "Снято с публикации." : "Опубликовано.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    }
  }

  async function remove(item: NewsItem) {
    if (!token) return;
    if (!confirm(`Удалить новость «${item.title}»? Действие необратимо.`)) return;
    try {
      await apiFetch(`/admin/content/news/${item.id}`, { method: "DELETE", token });
      await loadList();
      if (draft.id === item.id) startNew();
      setMessage("Новость удалена.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить новость.");
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Новости</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Новости</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS / Новости</h1>
          <p className="page-subtitle">Создание и редактирование новостных публикаций.</p>
        </header>
        {message ? <p className="status-pill">{message}</p> : null}

        <div className="moderation-layout">
          <div className="stack-list">
            <div className="auth-actions">
              <button className="button" type="button" onClick={startNew}>
                + Новая новость
              </button>
            </div>
            {items.length === 0 ? <p className="page-subtitle">Новостей пока нет.</p> : null}
            {items.map((item) => (
              <article className={`moderation-case-row ${draft.id === item.id ? "active" : ""}`} key={item.id}>
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  style={{ all: "unset", cursor: "pointer", width: "100%" }}
                >
                  <span className="status-pill">{item.status === "published" ? "Опубликовано" : "Черновик"}</span>
                  <strong style={{ display: "block", marginTop: 4 }}>{item.title}</strong>
                  <span style={{ display: "block" }}>{item.lead}</span>
                  <small>
                    {item.tags.map((t) => `#${t.newsTag.name}`).join(" ")}
                  </small>
                </button>
                <div className="auth-actions" style={{ marginTop: 8 }}>
                  <button className="button secondary" type="button" onClick={() => publishToggle(item)}>
                    {item.status === "published" ? "Снять с публикации" : "Опубликовать"}
                  </button>
                  <button className="button secondary" type="button" onClick={() => remove(item)}>
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="moderation-detail">
            <form className="form" onSubmit={submit}>
              <h2>{draft.id ? "Редактирование новости" : "Новая новость"}</h2>

              <label className="form-field">
                <span>Заголовок</span>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  required
                />
              </label>

              <label className="form-field">
                <span>Лид (краткое описание)</span>
                <textarea
                  className="textarea small"
                  value={draft.lead}
                  onChange={(event) => setDraft((prev) => ({ ...prev, lead: event.target.value }))}
                  required
                />
              </label>

              <FileUploadField
                accept="image/*"
                buttonLabel="Загрузить обложку"
                label="Обложка (необязательно)"
                value={draft.coverImageId}
                onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
              />

              <div className="form-field">
                <span>Теги</span>
                <div className="auth-actions" style={{ flexWrap: "wrap", gap: 4 }}>
                  {draft.tags.map((tag) => (
                    <span className="status-pill" key={tag}>
                      #{tag}{" "}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          marginLeft: 4,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  className="input"
                  placeholder="Введите тег и нажмите Enter или пробел"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Пробел и Enter превращают введённое в чип. Запятая на всякий
                    // случай — частый паттерн в подобных полях.
                    if (event.key === "Enter" || event.key === " " || event.key === ",") {
                      event.preventDefault();
                      addTag(tagDraft);
                      return;
                    }
                    // Backspace на пустом инпуте — удаление последнего чипа.
                    if (event.key === "Backspace" && tagDraft.length === 0 && draft.tags.length > 0) {
                      event.preventDefault();
                      removeTag(draft.tags[draft.tags.length - 1]!);
                    }
                  }}
                />
                {filteredSuggestions.length > 0 ? (
                  <div className="auth-actions" style={{ flexWrap: "wrap", gap: 4 }}>
                    {filteredSuggestions.map((suggestion) => (
                      <button
                        className="button secondary"
                        key={suggestion}
                        type="button"
                        onClick={() => addTag(suggestion)}
                      >
                        + {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="form-field">
                <span>Блоки контента</span>
                <BlocksEditor
                  blocks={draft.blocks}
                  onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks }))}
                  allowedKinds={NEWS_BLOCK_KINDS}
                />
              </div>

              <div className="auth-actions">
                <button className="button" type="submit" disabled={submitting}>
                  {submitting ? "Сохраняю…" : draft.id ? "Сохранить изменения" : "Создать черновик"}
                </button>
                {draft.id ? (
                  <button className="button secondary" type="button" onClick={startNew}>
                    Отмена
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

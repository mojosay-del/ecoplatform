"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, ImageIcon, Plus, X } from "lucide-react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { Block, BlocksEditor, NEWS_BLOCK_KINDS } from "./BlocksEditor";
import { ContentBlocks } from "../views/content-blocks";
import { FileUploadField } from "./FileUploadField";
import { RowKebab, type ActionItem } from "./RowKebab";
import { ApiError, api, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCoverAssets } from "../lib/use-cover-assets";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

type NewsTag = {
  id: string;
  name: string;
};

type NewsTagOption = NewsTag & {
  usageCount: number;
};

type NewsItem = {
  id: string;
  title: string;
  lead: string;
  slug: string;
  status: "draft" | "published";
  coverImageId: string | null;
  tags: Array<{ newsTagId: string; newsTag: NewsTag }>;
  createdAt: string;
  updatedAt: string;
  _count?: { blocks: number; comments: number; likes: number };
};

type NewsDetail = NewsItem & {
  blocks: Block[];
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
  blocks: [{ type: "paragraph", payload: { html: "" } }],
};

const NEWS_LIST_PAGE_SIZE = 20;

export function AdminNewsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [tagOptions, setTagOptions] = useState<NewsTagOption[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingOriginal, setEditingOriginal] = useState<NewsDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const newsQuery = useInfiniteApiQuery<NewsItem>(
    token ? "admin-news" : null,
    NEWS_LIST_PAGE_SIZE,
    ({ limit, offset }) =>
      api.admin.news.list({ limit, offset }) as Promise<{ items: NewsItem[]; total: number; hasMore: boolean }>,
  );
  const items = newsQuery.items;

  const covers = useCoverAssets(items);

  // Все сохранённые теги — основа автокомплита. Теги из списка новостей
  // оставляем как локальный fallback, если список тегов ещё обновляется.
  const knownTags = useMemo(() => {
    const set = new Set(tagOptions.map((tag) => tag.name));
    for (const item of items) {
      for (const tag of item.tags) set.add(tag.newsTag.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }, [items, tagOptions]);

  const filteredSuggestions = useMemo(() => {
    if (!tagDraft.trim()) return [];
    const query = tagDraft.trim().toLowerCase();
    return knownTags.filter((tag) => tag.toLowerCase().includes(query) && !draft.tags.includes(tag)).slice(0, 8);
  }, [tagDraft, knownTags, draft.tags]);

  // Запоминаем «оригинал» текущей открытой новости — нужен для индикатора
  // «есть несохранённые изменения» внизу формы.
  const original = useMemo(
    () => (draft.id && editingOriginal?.id === draft.id ? editingOriginal : null),
    [draft.id, editingOriginal],
  );

  const hasChanges = useMemo(() => {
    if (!draft.id) {
      // Новый черновик — считаем изменением, если есть заголовок или лид.
      return draft.title.trim().length > 0 || draft.lead.trim().length > 0;
    }
    if (!original) return false;
    if (draft.title !== original.title) return true;
    if (draft.lead !== original.lead) return true;
    if ((draft.coverImageId || "") !== (original.coverImageId ?? "")) return true;
    const origTags = original.tags
      .map((t) => t.newsTag.name)
      .sort()
      .join("|");
    const draftTags = [...draft.tags].sort().join("|");
    if (origTags !== draftTags) return true;
    if (
      JSON.stringify(draft.blocks) !==
      JSON.stringify(original.blocks.map((b) => ({ type: b.type, payload: b.payload })))
    ) {
      return true;
    }
    return false;
  }, [draft, original]);

  async function loadList() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const tags = await apiFetch<NewsTagOption[]>("/admin/content/news/tags", { token });
      newsQuery.reload();
      setTagOptions(tags);
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
    setEditingOriginal(null);
    setTagDraft("");
  }

  async function startEdit(item: NewsItem) {
    if (!token) return;
    setMessage(null);
    const detail = (await api.admin.news.get(item.id)) as NewsDetail;
    setEditingOriginal(detail);
    setDraft({
      id: detail.id,
      title: detail.title,
      lead: detail.lead,
      coverImageId: detail.coverImageId ?? "",
      tags: detail.tags.map((t) => t.newsTag.name),
      blocks: detail.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
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
        coverImageId: draft.coverImageId.trim() || null,
        tags: draft.tags,
        blocks: draft.blocks,
      };
      let saved: NewsDetail;
      if (draft.id) {
        saved = (await apiFetch(`/admin/content/news/${draft.id}`, { method: "PATCH", token, body })) as NewsDetail;
      } else {
        saved = (await apiFetch("/admin/content/news", { method: "POST", token, body })) as NewsDetail;
      }
      setMessage(draft.id ? "Новость обновлена." : "Новость создана как черновик.");
      setEditingOriginal(saved);
      newsQuery.reload();
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
      newsQuery.reload();
      setMessage(item.status === "published" ? "Снято с публикации." : "Опубликовано.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    }
  }

  async function remove(item: NewsItem) {
    if (!token) return;
    if (!confirm(`Полностью удалить новость «${item.title}»? Действие необратимо.`)) return;
    try {
      await apiFetch(`/admin/content/news/${item.id}`, { method: "DELETE", token });
      newsQuery.reload();
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

  const isEditingNew = draft.id === null;
  const draftCoverUrl = draft.coverImageId ? (covers.get(draft.coverImageId)?.publicUrl ?? null) : null;
  const canPreview = draft.title.trim().length > 0 || draft.lead.trim().length > 0 || draft.blocks.length > 0;

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS</h1>
          <p className="page-subtitle">Создание и редактирование новостных публикаций.</p>
        </header>
        <CmsTabs />
        {message || newsQuery.errorMessage ? <p className="cms-flash">{message ?? newsQuery.errorMessage}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <div className="education-tree-header">
              <h2 className="education-tree-title">Все новости</h2>
              <button
                className="education-tree-add"
                type="button"
                onClick={startNew}
                title="Новая новость"
                aria-label="Новая новость"
              >
                <Plus size={14} />
              </button>
            </div>
            {items.length === 0 && !newsQuery.isInitialLoading ? (
              <p className="education-tree-empty">Новостей пока нет.</p>
            ) : null}
            <div className="news-list">
              {items.map((item) => {
                const coverUrl = item.coverImageId ? covers.get(item.coverImageId)?.publicUrl : null;
                const actions: ActionItem[] = [
                  {
                    label: item.status === "published" ? "Снять с публикации" : "Опубликовать",
                    onClick: () => publishToggle(item),
                  },
                  { label: "Удалить", onClick: () => remove(item), danger: true },
                ];
                const isActive = draft.id === item.id;
                return (
                  <article key={item.id} className={`news-row${isActive ? " is-active" : ""}`}>
                    <button type="button" className="news-row-main" onClick={() => void startEdit(item)}>
                      <div className="news-row-thumb">
                        {coverUrl ? (
                          <img alt="" src={coverUrl} />
                        ) : (
                          <div className="news-row-thumb-fallback">
                            <ImageIcon size={18} />
                          </div>
                        )}
                      </div>
                      <div className="news-row-info">
                        <div className="news-row-line">
                          <span
                            className={`news-row-dot${item.status === "published" ? " is-published" : ""}`}
                            aria-hidden
                          />
                          <strong className="news-row-title">{item.title}</strong>
                        </div>
                        {item.lead ? <p className="news-row-lead">{item.lead}</p> : null}
                        {item.tags.length > 0 ? (
                          <div className="news-row-tags">
                            {item.tags.slice(0, 4).map((t) => (
                              <span className="tag-chip is-static" key={t.newsTag.id}>
                                #{t.newsTag.name}
                              </span>
                            ))}
                            {item.tags.length > 4 ? (
                              <span className="news-row-tags-more">+{item.tags.length - 4}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </button>
                    <RowKebab actions={actions} />
                  </article>
                );
              })}
            </div>
            <div ref={newsQuery.sentinelRef} aria-hidden="true" />
            {newsQuery.isLoadingMore ? <p className="page-subtitle news-list-more">Загружаем ещё…</p> : null}
            {!newsQuery.hasMore && items.length > 0 ? (
              <p className="page-subtitle news-list-more">Это все новости.</p>
            ) : null}
          </div>

          <div className="moderation-detail">
            <form className="form news-form" onSubmit={submit}>
              <div className="news-form-head">
                <span className="news-form-mode">{isEditingNew ? "Новая новость" : "Редактирование"}</span>
              </div>

              <FileUploadField
                accept="image/*"
                buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
                imagePreset="cover"
                label="Обложка новости"
                value={draft.coverImageId}
                onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
              />

              <input
                className="news-form-title"
                placeholder="Заголовок новости…"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                required
              />

              <label className="form-field">
                <span>Описание новости</span>
                <textarea
                  className="textarea small"
                  placeholder="Краткое содержание, 1–2 предложения"
                  value={draft.lead}
                  onChange={(event) => setDraft((prev) => ({ ...prev, lead: event.target.value }))}
                  required
                  rows={2}
                />
              </label>

              <div className="form-field">
                <span>Содержание новости</span>
                <BlocksEditor
                  blocks={draft.blocks}
                  onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks }))}
                  allowedKinds={NEWS_BLOCK_KINDS}
                />
              </div>

              <div className="form-field">
                <span>Теги</span>
                <div className="tag-input">
                  {draft.tags.map((tag) => (
                    <span className="tag-chip" key={tag}>
                      #{tag}
                      <button
                        type="button"
                        className="tag-chip-remove"
                        onClick={() => removeTag(tag)}
                        aria-label={`Убрать тег ${tag}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    className="tag-input-field"
                    placeholder={draft.tags.length === 0 ? "Добавьте теги — Enter или пробел" : "Ещё тег…"}
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " " || event.key === ",") {
                        event.preventDefault();
                        addTag(tagDraft);
                        return;
                      }
                      if (event.key === "Backspace" && tagDraft.length === 0 && draft.tags.length > 0) {
                        event.preventDefault();
                        removeTag(draft.tags[draft.tags.length - 1]!);
                      }
                    }}
                  />
                </div>
                {filteredSuggestions.length > 0 ? (
                  <div className="tag-suggestions">
                    {filteredSuggestions.map((suggestion) => (
                      <button
                        className="tag-suggestion"
                        key={suggestion}
                        type="button"
                        onClick={() => addTag(suggestion)}
                      >
                        <Plus size={11} /> {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="lesson-save-bar">
                <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : ""}`}>
                  {submitting
                    ? "Сохраняю…"
                    : hasChanges
                      ? isEditingNew
                        ? "Новый черновик"
                        : "Есть несохранённые изменения"
                      : "Всё сохранено"}
                </span>
                <div className="lesson-save-bar-actions">
                  {!isEditingNew ? (
                    <button className="button secondary" type="button" onClick={startNew}>
                      Отмена
                    </button>
                  ) : null}
                  {!isEditingNew && original ? (
                    <button className="button secondary" type="button" onClick={() => publishToggle(original)}>
                      {original.status === "published" ? "Снять с публикации" : "Опубликовать"}
                    </button>
                  ) : null}
                  {!isEditingNew && original ? (
                    <button className="button secondary danger" type="button" onClick={() => remove(original)}>
                      Удалить полностью
                    </button>
                  ) : null}
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    disabled={!canPreview}
                  >
                    <Eye size={14} />
                    Предпросмотр
                  </button>
                  <button className="button" type="submit" disabled={submitting || !hasChanges}>
                    {submitting ? "Сохраняю…" : isEditingNew ? "Создать черновик" : "Сохранить"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
        {previewOpen ? (
          <NewsPreviewModal
            title={draft.title}
            lead={draft.lead}
            coverUrl={draftCoverUrl}
            blocks={draft.blocks}
            tags={draft.tags}
            onClose={() => setPreviewOpen(false)}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

// Предпросмотр новости: рисует то же, что увидит читатель в модалке
// /news?post=... — общий рендерер ContentBlocks, обложка сверху, заголовок,
// описание и блоки контента. Без комментариев, лайков и других интерактивов.
function NewsPreviewModal({
  title,
  lead,
  coverUrl,
  blocks,
  tags,
  onClose,
}: {
  title: string;
  lead: string;
  coverUrl: string | null;
  blocks: Block[];
  tags: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("news-modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("news-modal-open");
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="news-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="news-modal">
        <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть предпросмотр">
          <X size={20} />
        </button>
        <div className="news-article">
          {coverUrl ? (
            <div className="news-article-cover">
              <img alt={title || "Превью"} src={coverUrl} />
            </div>
          ) : null}
          <div className="news-article-body">
            <span className="news-tile-category">Предпросмотр · Новости</span>
            <h1 className="news-article-title">{title || "Без заголовка"}</h1>
            {lead ? <p className="news-article-lead">{lead}</p> : null}
            <div className="content-blocks">
              <ContentBlocks blocks={blocks as Parameters<typeof ContentBlocks>[0]["blocks"]} />
            </div>
            {tags.length > 0 ? (
              <div className="news-row-tags" style={{ marginTop: 16 }}>
                {tags.map((tag) => (
                  <span className="tag-chip is-static" key={tag}>
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

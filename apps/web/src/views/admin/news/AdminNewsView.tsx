"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { errorText, api, apiFetch, preferredFileAssetImageUrl } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { canAutosaveDraft, useCmsAutosave, useUnsavedChangesWarning } from "../../../lib/cms-autosave";
import { canonicalizeBlocks } from "../../../lib/editor/serializer";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import { useCoverAssets } from "../../../lib/use-cover-assets";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import type { DraftState, NewsDetail, NewsItem, NewsTagOption, TagSuggestion } from "./types";
import { EMPTY_DRAFT, NEWS_LIST_PAGE_SIZE } from "./constants";
import { NewsEditorForm } from "./NewsEditorForm";
import { NewsRow } from "./NewsRow";

export function AdminNewsView() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingOriginal, setEditingOriginal] = useState<NewsDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [newsSearch, setNewsSearch] = useState("");
  const [appliedNewsSearch, setAppliedNewsSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const newsSearchQuery = appliedNewsSearch.trim();
  // Список — react-query: ключ включает строку поиска, поэтому смена запроса
  // сама триггерит загрузку (без ручного refetch).
  const newsQuery = useInfiniteApiQuery<NewsItem>(
    queryKeys.admin.newsList(newsSearchQuery),
    NEWS_LIST_PAGE_SIZE,
    ({ limit, offset }) =>
      api.admin.news.list({ limit, offset, q: newsSearchQuery || undefined }) as Promise<{
        items: NewsItem[];
        total: number;
        hasMore: boolean;
      }>,
  );
  const items = newsQuery.items;
  const state = newsQuery.state;
  // Теги — основа автокомплита; их сбой не должен ронять страницу.
  const { data: tagOptions } = useApiQuery<NewsTagOption[]>(
    queryKeys.admin.newsTags(),
    () => apiFetch<NewsTagOption[]>("/admin/content/news/tags"),
    [],
  );

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

  const tagSuggestions = useMemo<TagSuggestion[]>(() => {
    const selectedTags = new Set(draft.tags.map((tag) => tag.toLowerCase()));
    const query = tagDraft.trim().toLowerCase();
    const byName = new Map<string, TagSuggestion>();

    for (const tag of tagOptions) {
      const key = tag.name.toLowerCase();
      if (!selectedTags.has(key)) byName.set(key, { name: tag.name, usageCount: tag.usageCount });
    }
    for (const tag of knownTags) {
      const key = tag.toLowerCase();
      if (!selectedTags.has(key) && !byName.has(key)) byName.set(key, { name: tag });
    }

    return [...byName.values()]
      .filter((tag) => (query ? tag.name.toLowerCase().includes(query) : true))
      .sort((a, b) => {
        const usageDiff = (b.usageCount ?? 0) - (a.usageCount ?? 0);
        return usageDiff || a.name.localeCompare(b.name, "ru");
      })
      .slice(0, 10);
  }, [draft.tags, knownTags, tagDraft, tagOptions]);

  const tagSuggestionLabel = tagDraft.trim() ? "Подходящие теги" : "Популярные теги";

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
    if (draft.pinnedInForum !== (original.pinnedInForum ?? false)) return true;
    const origTags = original.tags
      .map((t) => t.newsTag.name)
      .sort()
      .join("|");
    const draftTags = [...draft.tags].sort().join("|");
    if (origTags !== draftTags) return true;
    if (
      JSON.stringify(canonicalizeBlocks(draft.blocks)) !==
      JSON.stringify(canonicalizeBlocks(original.blocks.map((b) => ({ type: b.type, payload: b.payload }))))
    ) {
      return true;
    }
    return false;
  }, [draft, original]);

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
      pinnedInForum: detail.pinnedInForum ?? false,
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

  function submitNewsSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedNewsSearch(newsSearch.trim());
  }

  function resetNewsSearch() {
    setNewsSearch("");
    setAppliedNewsSearch("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const wasNew = !draft.id;
      await persistNewsDraft();
      setMessage(wasNew ? "Новость создана как черновик." : "Новость обновлена.");
      if (wasNew) startNew();
    } catch (error) {
      setMessage(errorText(error, "Не удалось сохранить новость."));
    } finally {
      setSubmitting(false);
    }
  }

  async function publishToggle(item: NewsItem) {
    if (!token) return;
    // Если публикуем открытую в редакторе новость с несохранёнными правками —
    // сперва сохраняем черновик, иначе опубликуется устаревшая версия.
    if (draft.id === item.id && hasChanges) {
      try {
        await persistNewsDraft();
      } catch (error) {
        setMessage(errorText(error, "Не удалось сохранить перед публикацией."));
        return;
      }
    }
    const path =
      item.status === "published"
        ? `/admin/content/news/${item.id}/unpublish`
        : `/admin/content/news/${item.id}/publish`;
    try {
      await apiFetch(path, { method: "POST" });
      newsQuery.reload();
      setMessage(item.status === "published" ? "Снято с публикации." : "Опубликовано.");
    } catch (error) {
      setMessage(errorText(error, "Не удалось изменить статус."));
    }
  }

  async function remove(item: NewsItem) {
    if (!token) return;
    if (!confirm(`Полностью удалить новость «${item.title}»? Действие необратимо.`)) return;
    try {
      await apiFetch(`/admin/content/news/${item.id}`, { method: "DELETE" });
      newsQuery.reload();
      if (draft.id === item.id) startNew();
      setMessage("Новость удалена.");
    } catch (error) {
      setMessage(errorText(error, "Не удалось удалить новость."));
    }
  }

  function previewHref(item: Pick<NewsItem, "slug">) {
    return `/news/${encodeURIComponent(item.slug)}?preview=1`;
  }

  function openSavedPreview(item: Pick<NewsItem, "slug">) {
    window.open(previewHref(item), "_blank", "noopener,noreferrer");
  }

  const buildSaveBody = useCallback(
    () => ({
      title: draft.title.trim(),
      lead: draft.lead.trim(),
      coverImageId: draft.coverImageId.trim() || null,
      pinnedInForum: draft.pinnedInForum,
      tags: draft.tags,
      blocks: draft.blocks,
    }),
    [draft],
  );

  const persistNewsDraft = useCallback(async () => {
    if (!token) throw new Error("Нет активной сессии.");
    const body = buildSaveBody();
    const saved = draft.id
      ? ((await apiFetch(`/admin/content/news/${draft.id}`, { method: "PATCH", body })) as NewsDetail)
      : ((await apiFetch("/admin/content/news", { method: "POST", body })) as NewsDetail);
    setEditingOriginal(saved);
    newsQuery.reload();
    return saved;
  }, [buildSaveBody, draft.id, newsQuery, token]);

  const newsAutosave = useCmsAutosave({
    enabled: canAutosaveDraft(original?.status, draft.id) && !submitting,
    hasChanges,
    onSave: persistNewsDraft,
  });

  useUnsavedChangesWarning(Boolean(draft.id) && hasChanges);

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
  const canOpenSavedPreview = Boolean(original && !hasChanges);
  const autosaveEnabled = canAutosaveDraft(original?.status, draft.id);
  const saveStatusClass = autosaveEnabled
    ? `is-${newsAutosave.autosaveState}`
    : hasChanges
      ? "has-changes"
      : "is-saved";

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Новости</h1>
          <p className="page-subtitle">Создание и редактирование новостных публикаций.</p>
        </header>
        {message || newsQuery.errorMessage ? <p className="cms-flash">{message ?? newsQuery.errorMessage}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="moderation-detail">
            <NewsEditorForm
              autosaveEnabled={autosaveEnabled}
              autosaveLabel={newsAutosave.autosaveLabel}
              canOpenSavedPreview={canOpenSavedPreview}
              draft={draft}
              hasChanges={hasChanges}
              isAutosaving={newsAutosave.isAutosaving}
              isEditingNew={isEditingNew}
              original={original}
              saveStatusClass={saveStatusClass}
              submitting={submitting}
              tagDraft={tagDraft}
              tagSuggestionLabel={tagSuggestionLabel}
              tagSuggestions={tagSuggestions}
              onAddTag={addTag}
              onAutosaveBlur={newsAutosave.handleAutosaveBlur}
              onDraftChange={setDraft}
              onPublishToggle={publishToggle}
              onRemove={remove}
              onRemoveTag={removeTag}
              onStartNew={startNew}
              onSubmit={submit}
              onTagDraftChange={setTagDraft}
              previewHref={previewHref}
            />
          </div>

          <div className="education-tree">
            <div className="education-tree-header">
              <h2 className="education-tree-title">Все новости</h2>
              <div className="news-list-tools">
                <form className="news-list-search" onSubmit={submitNewsSearch} role="search">
                  <input
                    type="search"
                    value={newsSearch}
                    onChange={(event) => setNewsSearch(event.target.value)}
                    placeholder="Поиск по заголовку"
                    aria-label="Поиск по заголовкам новостей"
                  />
                  <button className="news-list-search-submit" type="submit" aria-label="Искать новости">
                    <Search size={14} aria-hidden="true" />
                  </button>
                  <button
                    className="news-list-search-reset"
                    type="button"
                    onClick={resetNewsSearch}
                    disabled={!newsSearch && !newsSearchQuery}
                    aria-label="Сбросить поиск"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </form>
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
            </div>
            {items.length === 0 && !newsQuery.isInitialLoading ? (
              <p className="education-tree-empty">
                {newsSearchQuery ? "Новостей с таким заголовком нет." : "Новостей пока нет."}
              </p>
            ) : null}
            <div className="news-list">
              {items.map((item) => (
                <NewsRow
                  key={item.id}
                  item={item}
                  isActive={draft.id === item.id}
                  coverUrl={preferredFileAssetImageUrl(item.coverImageId ? covers.get(item.coverImageId) : null)}
                  onEdit={() => void startEdit(item)}
                  onPreview={() => openSavedPreview(item)}
                  onPublishToggle={() => publishToggle(item)}
                  onRemove={() => remove(item)}
                />
              ))}
            </div>
            <div ref={newsQuery.sentinelRef} aria-hidden="true" />
            {newsQuery.isLoadingMore ? <p className="page-subtitle news-list-more">Загружаем ещё…</p> : null}
            {!newsQuery.hasMore && items.length > 0 ? (
              <p className="page-subtitle news-list-more">Это все новости.</p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import { AnimatedSearchPlaceholder } from "../../components/AnimatedSearchPlaceholder";
import { AppShell } from "../../components/AppShell";
import { NewsOnboardingCard } from "../../components/NewsOnboardingCard";
import { NEWS_ONBOARDING_STORAGE_KEY, shouldShowNewsOnboarding } from "../../components/news-onboarding-state";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { queryKeys } from "../../lib/query";
import { useCoverAssets, useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { AccessClosed, AuthRequired, ErrorState, getNewsFeedSnapshot } from "../shared";
import { buildNewsUrl, normaliseNewsTagSelection, toggleNewsTagSelection } from "../news-tag-filters";
import { NEWS_PAGE_SIZE } from "./constants";
import { NewsCard, NewsCardSkeleton } from "./NewsCard";
import { NewsModal } from "./NewsModal";

const SEARCH_DEBOUNCE_MS = 2000;
const NEWS_SEARCH_EXAMPLES = ["Заводы", "Логистика", "Законы", "Субсидии", "Цены", "Переработка"];

export function NewsView() {
  const { ready, token, user } = useAuth();
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean | null>(null);
  const [newsSearchQuery, setNewsSearchQuery] = useState("");
  const [debouncedNewsSearchQuery, setDebouncedNewsSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const selectedTags = useMemo(
    () => normaliseNewsTagSelection(new URLSearchParams(currentSearch).getAll("tag")),
    [currentSearch],
  );
  const activeNewsSearchQuery = debouncedNewsSearchQuery.length >= 2 ? debouncedNewsSearchQuery : "";
  const feedKey = queryKeys.news.list({
    q: activeNewsSearchQuery || undefined,
    tags: selectedTags,
  });
  const feed = useInfiniteApiQuery(ready && token ? feedKey : null, NEWS_PAGE_SIZE, ({ limit, offset }) =>
    api.news.list(
      {
        limit,
        offset,
        q: activeNewsSearchQuery || undefined,
        tags: selectedTags,
      },
      {
        token,
      },
    ),
  );
  const { items, setItems, state, errorMessage, hasMore, isLoadingMore, sentinelRef } = feed;
  const covers = useCoverAssets(items);
  const audioFileIds = useMemo(
    () =>
      Array.from(
        new Set(
          items.map((post) => post.audioAttachment?.fileId).filter((fileId): fileId is string => Boolean(fileId)),
        ),
      ).sort(),
    [items],
  );
  const audioAssets = useFileAssetsByIds(audioFileIds);
  const openedSlug = searchParams.get("post");
  const showOnboarding =
    user && onboardingDismissed === false ? shouldShowNewsOnboarding(user, onboardingDismissed) : false;
  const hasNewsSearchDraft = newsSearchQuery.length > 0;
  const isNewsSearching = activeNewsSearchQuery.length >= 2;

  useEffect(() => {
    try {
      setOnboardingDismissed(localStorage.getItem(NEWS_ONBOARDING_STORAGE_KEY) === "1");
    } catch {
      setOnboardingDismissed(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedNewsSearchQuery(newsSearchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [newsSearchQuery]);

  // Модалка открывается через query ?post=slug: есть shareable URL, browser back/forward и закрытие через URL.
  function openPost(slug: string) {
    router.push(buildNewsUrl(currentSearch, selectedTags, slug), { scroll: false });
  }

  function closePost() {
    router.push(buildNewsUrl(currentSearch, selectedTags), { scroll: false });
  }

  function postHref(slug: string) {
    return buildNewsUrl(currentSearch, selectedTags, slug);
  }

  function selectTag(tag: string) {
    const nextTags = toggleNewsTagSelection(selectedTags, tag);
    router.push(buildNewsUrl(currentSearch, nextTags), { scroll: true });
  }

  function resetSearch() {
    setNewsSearchQuery("");
    setDebouncedNewsSearchQuery("");
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDebouncedNewsSearchQuery(newsSearchQuery.trim());
  }

  function updatePostInFeed(updatedPost: NewsPostDetail) {
    setItems((current) =>
      current.map((post) => (post.id === updatedPost.id ? { ...post, ...getNewsFeedSnapshot(updatedPost) } : post)),
    );
    queryClient.setQueryData(queryKeys.news.detail(updatedPost.slug), updatedPost);
  }

  function dismissOnboarding() {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem(NEWS_ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // ignore (private mode)
    }
  }

  if (state === "unauthenticated") {
    return <AuthRequired title="Новости" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Новости" />;
  }

  if (state === "error") {
    return <ErrorState title="Новости" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <header className="news-feed-header">
          <p className="page-hero-eyebrow">Сигналы рынка</p>
          <h1>Новости</h1>
          <p className="news-feed-subtitle">События и решения компаний, которые двигают вторсырьё.</p>
          <form className="news-feed-search" onSubmit={handleSearch} role="search">
            <input
              aria-label="Поиск по новостям"
              onChange={(event) => setNewsSearchQuery(event.currentTarget.value)}
              type="search"
              value={newsSearchQuery}
            />
            {!hasNewsSearchDraft ? (
              <AnimatedSearchPlaceholder className="news-feed-search-placeholder" examples={NEWS_SEARCH_EXAMPLES} />
            ) : null}
            {hasNewsSearchDraft ? (
              <button
                aria-label="Сбросить поиск по новостям"
                className="news-feed-search-reset"
                onClick={resetSearch}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </form>
        </header>
        {showOnboarding && user ? <NewsOnboardingCard user={user} onDismiss={dismissOnboarding} /> : null}

        {state === "loading" ? (
          <div className="news-masonry" aria-busy="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <article className="news-tile news-tile-with-cover is-awaiting-cover" key={index} aria-hidden="true">
                <NewsCardSkeleton />
              </article>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="page-subtitle u-text-center u-py-60">
            {isNewsSearching
              ? `По запросу «${activeNewsSearchQuery}» ничего не найдено.`
              : selectedTags.length > 0
                ? "Нет публикаций с выбранными тегами."
                : "Пока нет публикаций."}
          </p>
        ) : (
          <div className="news-masonry">
            {items.map((post, index) => (
              <NewsCard
                audioAsset={
                  post.audioAttachment?.fileId ? (audioAssets.get(post.audioAttachment.fileId) ?? null) : null
                }
                cover={post.coverImageId ? (covers.get(post.coverImageId) ?? null) : null}
                href={postHref(post.slug)}
                index={index}
                key={post.id}
                onOpen={openPost}
                onSelectTag={selectTag}
                post={post}
                selectedTags={selectedTags}
              />
            ))}
          </div>
        )}
        <div ref={sentinelRef} aria-hidden="true" />
        {isLoadingMore ? <p className="page-subtitle u-text-center">Загружаем ещё…</p> : null}
        {!hasMore && items.length > 0 ? <p className="page-subtitle u-text-center">Это все записи.</p> : null}
      </section>
      {openedSlug ? <NewsModal slug={openedSlug} onClose={closePost} onPostUpdate={updatePostInFeed} /> : null}
    </AppShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { NewsPostDetail, NewsTagSummary } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { NewsOnboardingCard } from "../../components/NewsOnboardingCard";
import { NEWS_ONBOARDING_STORAGE_KEY, shouldShowNewsOnboarding } from "../../components/news-onboarding-state";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCoverAssets, useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { AccessClosed, AuthRequired, ErrorState, getNewsFeedSnapshot, useApiQuery } from "../shared";
import {
  NEWS_ALL_TAG_LIMIT,
  addNewsTagSelection,
  buildNewsUrl,
  normaliseNewsTagSelection,
  toggleNewsTagSelection,
} from "../news-tag-filters";
import { NEWS_PAGE_SIZE } from "./constants";
import { NewsCard, NewsCardSkeleton } from "./NewsCard";
import { NewsModal } from "./NewsModal";
import { NewsTagFilters } from "./NewsTagFilters";

export function NewsView() {
  const { ready, token, user } = useAuth();
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean | null>(null);
  const [isAllTagsOpen, setIsAllTagsOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const selectedTags = useMemo(
    () => normaliseNewsTagSelection(new URLSearchParams(currentSearch).getAll("tag")),
    [currentSearch],
  );
  const selectedTagKey = selectedTags.join("\u001f");
  const feed = useInfiniteApiQuery(
    ready && token ? `news-feed:${selectedTagKey}` : null,
    NEWS_PAGE_SIZE,
    ({ limit, offset }) =>
      api.news.list(
        {
          limit,
          offset,
          tags: selectedTags,
        },
        {
          token,
        },
      ),
  );
  const { data: tagOptions, state: tagState } = useApiQuery<NewsTagSummary[]>(
    ready && token ? "news-tags" : null,
    () => api.news.tags({ limit: NEWS_ALL_TAG_LIMIT }, { token }),
    [],
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

  useEffect(() => {
    try {
      setOnboardingDismissed(localStorage.getItem(NEWS_ONBOARDING_STORAGE_KEY) === "1");
    } catch {
      setOnboardingDismissed(false);
    }
  }, []);

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

  function applyTags(nextTags: string[]) {
    setIsAllTagsOpen(false);
    router.push(buildNewsUrl(currentSearch, nextTags), { scroll: true });
  }

  function toggleTag(tag: string) {
    applyTags(toggleNewsTagSelection(selectedTags, tag));
  }

  function selectTag(tag: string) {
    const nextTags = addNewsTagSelection(selectedTags, tag);
    if (nextTags.length === selectedTags.length) return;
    applyTags(nextTags);
  }

  function clearTags() {
    applyTags([]);
  }

  function updatePostInFeed(updatedPost: NewsPostDetail) {
    setItems((current) =>
      current.map((post) => (post.id === updatedPost.id ? { ...post, ...getNewsFeedSnapshot(updatedPost) } : post)),
    );
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
          <h1>Новости</h1>
          <NewsTagFilters
            isAllTagsOpen={isAllTagsOpen}
            isLoading={tagState === "loading"}
            onClear={clearTags}
            onToggleDropdown={() => setIsAllTagsOpen((value) => !value)}
            onToggleTag={toggleTag}
            selectedTags={selectedTags}
            tagOptions={tagOptions}
          />
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
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            {selectedTags.length > 0 ? "Нет публикаций с выбранными тегами." : "Пока нет публикаций."}
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
        {isLoadingMore ? (
          <p className="page-subtitle" style={{ textAlign: "center" }}>
            Загружаем ещё…
          </p>
        ) : null}
        {!hasMore && items.length > 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center" }}>
            Это все записи.
          </p>
        ) : null}
      </section>
      {openedSlug ? <NewsModal slug={openedSlug} onClose={closePost} onPostUpdate={updatePostInFeed} /> : null}
    </AppShell>
  );
}

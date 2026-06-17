"use client";
import "../../styles/forum.css";

// Главная раздела «Форум»: поиск-герой + два фильтра-справочника + сортировка +
// лента вопросов с закреплёнными новостями сверху. Бесконечная лента, как на
// площадке (useInfiniteApiQuery). Правая колонка — мини-профиль + связанные разделы.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, Search } from "lucide-react";
import type { ForumPinnedNews, ForumQuestionListItem, ForumTaxonomy } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { AsideProfile, PinnedNewsCard, QuestionCard } from "./components";

type ForumSort = "newest" | "unanswered" | "popular";

const SORTS: { value: ForumSort; label: string }[] = [
  { value: "newest", label: "Новые" },
  { value: "unanswered", label: "Без ответа" },
  { value: "popular", label: "Популярные" },
];

const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };

export function ForumListView() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [questionTypeId, setQuestionTypeId] = useState("");
  const [sort, setSort] = useState<ForumSort>("newest");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const taxonomy = useApiQuery("forum-taxonomy", () => api.forum.taxonomy(), EMPTY_TAXONOMY);
  const pinned = useApiQuery("forum-pinned", () => api.forum.pinnedNews(), [] as ForumPinnedNews[]);

  const key = `forum-${sort}-${rawMaterialId}-${questionTypeId}-${debounced}`;
  const feed = useInfiniteApiQuery<ForumQuestionListItem>(key, 20, ({ limit, offset }) =>
    api.forum.questions({
      sort,
      rawMaterialId: rawMaterialId || undefined,
      questionTypeId: questionTypeId || undefined,
      q: debounced || undefined,
      limit,
      offset,
    }),
  );

  if (feed.state === "unauthenticated") return <AuthRequired title="Форум" />;
  if (feed.state === "forbidden") return <AccessClosed title="Форум" />;
  if (feed.state === "error") return <ErrorState title="Форум" message={feed.errorMessage} />;

  const userName = user ? `${user.firstName} ${user.lastName.charAt(0)}.`.trim() : "Участник";
  const countLabel = `${feed.total} ${pluralizeRu(feed.total, "вопрос", "вопроса", "вопросов")}`;
  const showPinned = pinned.data.length > 0 && sort === "newest" && !debounced;

  return (
    <AppShell>
      <section className="page forum-page">
        <div className="forum-hero">
          <div className="forum-hero__head">
            <div>
              <p className="forum-kicker">Сообщество</p>
              <h1 className="forum-title">Форум</h1>
              <p className="forum-subtitle">Вопросы и ответы сообщества — отраслевая память, которую находят поиском</p>
            </div>
            <Link href="/forum/ask" className="button">
              Задать вопрос
            </Link>
          </div>
          <label className="forum-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: документы на перевозку макулатуры"
              aria-label="Поиск по форуму"
            />
          </label>
        </div>

        <div className="forum-layout">
          <div className="forum-main">
            <div className="forum-filters">
              <div className="forum-filters__row">
                <div className="forum-field">
                  <label htmlFor="forum-mat">Вид сырья</label>
                  <select
                    id="forum-mat"
                    className="select"
                    value={rawMaterialId}
                    onChange={(event) => setRawMaterialId(event.target.value)}
                  >
                    <option value="">Все виды</option>
                    {taxonomy.data.rawMaterials.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="forum-field">
                  <label htmlFor="forum-type">Тип вопроса</label>
                  <select
                    id="forum-type"
                    className="select"
                    value={questionTypeId}
                    onChange={(event) => setQuestionTypeId(event.target.value)}
                  >
                    <option value="">Любой</option>
                    {taxonomy.data.questionTypes.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="forum-filters__note">
                <Lock size={14} /> Значения тегов ведёт администратор — поэтому список не разрастается
              </p>
            </div>

            <div className="forum-feed-head">
              <span className="forum-count">{countLabel}</span>
              <div className="forum-seg" role="group" aria-label="Сортировка">
                {SORTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={sort === option.value}
                    onClick={() => setSort(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {showPinned ? pinned.data.map((item) => <PinnedNewsCard key={item.id} item={item} />) : null}

            {feed.isInitialLoading ? <p className="forum-count">Загрузка…</p> : null}

            {feed.state === "ready" && feed.items.length === 0 ? (
              <div className="forum-empty">
                <p>
                  {debounced
                    ? "Ничего не найдено. Попробуйте изменить запрос или задайте вопрос."
                    : "Вопросов пока нет. Будьте первым — задайте вопрос."}
                </p>
                <Link href="/forum/ask" className="button" style={{ marginTop: 12 }}>
                  Задать вопрос
                </Link>
              </div>
            ) : null}

            {feed.items.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
            {feed.isLoadingMore ? <p className="forum-count">Загрузка…</p> : null}
            <div ref={feed.sentinelRef} className="forum-sentinel" />
          </div>

          <aside className="forum-aside">
            <AsideProfile
              name={userName}
              companyType={user?.company?.type ?? null}
              verified={user?.company?.status === "active"}
            />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

"use client";
import "../../styles/forum.css";

// Главная раздела «Форум»: поиск-герой + два фильтра-справочника + сортировка +
// лента вопросов с закреплёнными новостями сверху. Бесконечная лента, как на
// площадке (useInfiniteApiQuery). Правая колонка — мини-профиль + связанные разделы.

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check, ChevronDown, X } from "lucide-react";
import type { ForumPinnedNews, ForumQuestionListItem, ForumSummary, ForumTaxonomy } from "@ecoplatform/shared";
import { AnimatedSearchPlaceholder } from "../../components/AnimatedSearchPlaceholder";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { queryKeys } from "../../lib/query";
import { useInfiniteApiQuery } from "../../lib/use-infinite-api-query";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { AsideProfile, PinnedNewsCard, QuestionCard } from "./components";

type ForumSort = "newest" | "unanswered" | "popular";
type ForumFilterOption = { value: string; label: string };

const SORTS: { value: ForumSort; label: string }[] = [
  { value: "newest", label: "Новые" },
  { value: "unanswered", label: "Без ответа" },
  { value: "popular", label: "Популярные" },
];

const SEARCH_DEBOUNCE_MS = 2000;
const FORUM_SEARCH_EXAMPLES = [
  "Какое масло выбрать",
  "Хороший пресс",
  "Какой погрузчик выбрать",
  "Оптимизация склада",
  "Новый закон",
  "Нужна помощь",
];
const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };
const EMPTY_SUMMARY: ForumSummary = {
  solvedQuestionsCount: 0,
  currentUser: { answersCount: 0, solvedAnswersCount: 0 },
  weeklyExperts: [],
};

function ForumFilterSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: ForumFilterOption[];
  value: string;
}) {
  const generatedId = useId();
  const listboxId = `${id}-${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeItem = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const chooseOption = (index: number) => {
    const option = options[index];
    if (!option) return;

    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min((open ? current : selectedIndex) + 1, options.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max((open ? current : selectedIndex) - 1, 0));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        chooseOption(activeIndex);
        return;
      }
      setOpen(true);
    }
  };

  return (
    <div className={`forum-filter-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="forum-filter-select-trigger"
        id={id}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown aria-hidden="true" className="forum-filter-select-chevron" size={18} />
      </button>
      {open ? (
        <ul aria-labelledby={id} className="forum-filter-select-list" id={listboxId} ref={listRef} role="listbox">
          {options.map((option, index) => (
            <li
              aria-selected={option.value === value}
              className={`forum-filter-select-option${index === activeIndex ? " is-active" : ""}${
                option.value === value ? " is-selected" : ""
              }`}
              data-index={index}
              id={`${listboxId}-${index}`}
              key={option.value}
              onClick={() => chooseOption(index)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <span>{option.label}</span>
              {option.value === value ? <Check aria-hidden="true" size={16} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ForumListView() {
  const { user } = useAuth();
  const [queryDraft, setQueryDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [rawMaterialId, setRawMaterialId] = useState("");
  const [questionTypeId, setQuestionTypeId] = useState("");
  const [sort, setSort] = useState<ForumSort>("newest");

  const taxonomy = useApiQuery(queryKeys.forum.taxonomy(), () => api.forum.taxonomy(), EMPTY_TAXONOMY);
  const pinned = useApiQuery(queryKeys.forum.pinnedNews(), () => api.forum.pinnedNews(), [] as ForumPinnedNews[]);
  const summary = useApiQuery(queryKeys.forum.summary(), () => api.forum.summary(), EMPTY_SUMMARY);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(queryDraft.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [queryDraft]);

  const key = queryKeys.forum.list({
    sort,
    rawMaterialId: rawMaterialId || undefined,
    questionTypeId: questionTypeId || undefined,
    q: searchTerm || undefined,
  });
  const feed = useInfiniteApiQuery<ForumQuestionListItem>(key, 20, ({ limit, offset }) =>
    api.forum.questions({
      sort,
      rawMaterialId: rawMaterialId || undefined,
      questionTypeId: questionTypeId || undefined,
      q: searchTerm || undefined,
      limit,
      offset,
    }),
  );

  if (feed.state === "unauthenticated") return <AuthRequired title="Форум" />;
  if (feed.state === "forbidden") return <AccessClosed title="Форум" />;
  if (feed.state === "error") return <ErrorState title="Форум" message={feed.errorMessage} />;

  const userName = user ? `${user.firstName} ${user.lastName.charAt(0)}.`.trim() : "Участник";
  const countLabel = `${feed.total} ${pluralizeRu(feed.total, "вопрос", "вопроса", "вопросов")}`;
  const solvedLabel = `${summary.data.solvedQuestionsCount} ${pluralizeRu(
    summary.data.solvedQuestionsCount,
    "решённый вопрос",
    "решённых вопроса",
    "решённых вопросов",
  )} на форуме`;
  const showPinned = pinned.data.length > 0 && sort === "newest" && !searchTerm;
  const hasSearchDraft = queryDraft.length > 0;

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(queryDraft.trim());
  };

  const resetSearch = () => {
    setQueryDraft("");
    setSearchTerm("");
  };

  return (
    <AppShell>
      <section className="page forum-page">
        <div className="forum-hero">
          <h1 className="forum-title">Найдите готовый ответ — или спросите тех, кто уже сталкивался</h1>
          <form className="forum-search" onSubmit={handleSearch} role="search">
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              aria-label="Поиск по форуму"
            />
            {!hasSearchDraft ? (
              <AnimatedSearchPlaceholder className="forum-search__placeholder" examples={FORUM_SEARCH_EXAMPLES} />
            ) : null}
            {hasSearchDraft ? (
              <button className="forum-search__reset" type="button" aria-label="Сбросить поиск" onClick={resetSearch}>
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </form>
          <p className="forum-hero__metric">{solvedLabel} · обновляется ежедневно</p>
        </div>

        <div className="forum-layout">
          <div className="forum-main">
            <div className="forum-filters">
              <div className="forum-filters__row">
                <div className="forum-field">
                  <label htmlFor="forum-mat">Вид сырья</label>
                  <ForumFilterSelect
                    id="forum-mat"
                    label="Вид сырья"
                    value={rawMaterialId}
                    options={[
                      { value: "", label: "Все виды" },
                      ...taxonomy.data.rawMaterials.map((item) => ({ value: item.id, label: item.label })),
                    ]}
                    onChange={setRawMaterialId}
                  />
                </div>
                <div className="forum-field">
                  <label htmlFor="forum-type">Тип вопроса</label>
                  <ForumFilterSelect
                    id="forum-type"
                    label="Тип вопроса"
                    value={questionTypeId}
                    options={[
                      { value: "", label: "Любой" },
                      ...taxonomy.data.questionTypes.map((item) => ({ value: item.id, label: item.label })),
                    ]}
                    onChange={setQuestionTypeId}
                  />
                </div>
              </div>
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
                  {searchTerm
                    ? `По запросу «${searchTerm}» ничего не найдено. Попробуйте другие слова или задайте вопрос.`
                    : "Вопросов пока нет. Будьте первым — задайте вопрос."}
                </p>
                <Link href="/forum/ask" className="button u-mt-12">
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
              avatarUrl={user?.avatarUrl ?? null}
              companyType={user?.company?.type ?? null}
              isPlatformStaff={(user?.platformRoles?.length ?? 0) > 0}
              platformRoles={user?.platformRoles ?? []}
              verified={user?.company?.status === "active"}
              summary={summary.data.currentUser}
              weeklyExperts={summary.data.weeklyExperts}
            />
          </aside>
        </div>
      </section>
    </AppShell>
  );
}

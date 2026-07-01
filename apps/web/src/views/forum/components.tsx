"use client";

import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CircleCheck,
  Clock,
  Eye,
  Headphones,
  HelpCircle,
  LineChart,
  MessageSquare,
  Newspaper,
  Pin,
  Plus,
} from "lucide-react";
import type {
  ForumAuthorReputation,
  ForumPinnedNews,
  ForumQuestionListItem,
  ForumQuestionStatus,
  ForumSummary,
  ForumTaxonomyValue,
  PlatformRole,
} from "@ecoplatform/shared";
import { ArrowUpActionIcon } from "../../components/app-shell/nav-icons";
import {
  forumProfileRoleLabel,
  forumStatusLabel,
  forumStatusVariant,
  initialsFromName,
  relativeTime,
} from "./forum-helpers";
import { forumSearchSnippetSegments, forumSearchSnippetSourceLabel } from "./search-snippet";

export function StatusBadge({ status }: { status: ForumQuestionStatus }) {
  const variant = forumStatusVariant(status);
  return (
    <span className={`forum-badge forum-badge--${variant}`}>
      {variant === "solved" ? <CircleCheck size={14} /> : <HelpCircle size={14} />}
      {forumStatusLabel(status)}
    </span>
  );
}

export function TagChips({
  rawMaterial,
  questionType,
}: {
  rawMaterial: ForumTaxonomyValue | null;
  questionType: ForumTaxonomyValue | null;
}) {
  return (
    <>
      {rawMaterial ? <span className="forum-chip">{rawMaterial.label}</span> : null}
      {questionType ? <span className="forum-chip">{questionType.label}</span> : null}
    </>
  );
}

export function Avatar({ author, className }: { author: ForumAuthorReputation; className?: string }) {
  return (
    <span className={className ?? "forum-avatar"} aria-hidden="true">
      {author.avatarUrl ? <img src={author.avatarUrl} alt="" /> : initialsFromName(author.companyName ?? author.name)}
    </span>
  );
}

// Репутация автора: имя + роль + «проверенный» + рейтинг + сделки + решено на форуме.
export function Reputation({ author }: { author: ForumAuthorReputation }) {
  const displayName = author.companyName ?? author.name;
  const profileRoleLabel = forumProfileRoleLabel({
    companyType: author.companyType,
    isPlatformStaff: author.isPlatformStaff,
    verified: author.verified,
  });
  return (
    <span className="forum-who">
      <Avatar author={author} />
      <span className="forum-author-name">{displayName}</span>
      {profileRoleLabel ? (
        <span
          className="forum-profile-role forum-profile-role--inline"
          title={author.isPlatformStaff ? "Команда ЭкоПлатформы" : author.verified ? "Проверенная компания" : undefined}
        >
          <BadgeCheck size={15} />
          {profileRoleLabel}
        </span>
      ) : null}
      {author.rating != null ? <span className="forum-rep">★ {author.rating.toFixed(1)}</span> : null}
      {author.dealsCompleted > 0 ? <span className="forum-rep">{author.dealsCompleted} сделок</span> : null}
      {author.forumSolved > 0 ? <span className="forum-rep">{author.forumSolved} решено</span> : null}
    </span>
  );
}

export function QuestionCard({ question }: { question: ForumQuestionListItem }) {
  const variant = forumStatusVariant(question.status);
  return (
    <Link href={`/forum/q/${question.id}`} className={`forum-card forum-card--${variant}`} prefetch={false}>
      <div className="forum-tags">
        <StatusBadge status={question.status} />
        <TagChips rawMaterial={question.rawMaterial} questionType={question.questionType} />
      </div>
      <h3>{question.title}</h3>
      {question.searchSnippet ? (
        <SearchSnippet snippet={question.searchSnippet} />
      ) : question.status === "solved" && question.acceptedAnswerExcerpt ? (
        <div className="forum-answer-peek">
          <CircleCheck size={18} aria-hidden="true" />
          <p>Лучший ответ: {question.acceptedAnswerExcerpt}</p>
        </div>
      ) : (
        <p className="forum-card__body">{question.excerpt}</p>
      )}
      <div className="forum-meta">
        <Reputation author={question.author} />
        {question.topVotes > 0 ? (
          <span className="forum-stat">
            <ArrowUpActionIcon size={17} /> {question.topVotes}
          </span>
        ) : null}
        <span className="forum-stat">
          <MessageSquare size={15} /> {question.answersCount}
        </span>
        <span className="forum-stat">
          <Eye size={15} /> {question.views}
        </span>
        <span className="forum-stat">
          <Clock size={15} /> {relativeTime(question.createdAt)}
        </span>
      </div>
    </Link>
  );
}

function SearchSnippet({ snippet }: { snippet: NonNullable<ForumQuestionListItem["searchSnippet"]> }) {
  return (
    <p className="forum-search-snippet">
      <span>{forumSearchSnippetSourceLabel(snippet.source)}: </span>
      {forumSearchSnippetSegments(snippet).map((segment, index) =>
        segment.highlighted ? (
          <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function PinnedNewsCard({ item }: { item: ForumPinnedNews }) {
  return (
    // ?from=forum → страница новости открывается в стиле обсуждения форума с
    // кнопкой «К форуму» (а не «Назад к новостям»).
    <Link href={`/news/${item.slug}?from=forum`} className="forum-pinned">
      <div className="forum-tags">
        <span className="forum-badge forum-badge--pin">
          <Pin size={14} /> Закреплено
        </span>
        <span className="forum-chip">
          <Newspaper size={13} className="u-inline-icon" />
          Из новостей
        </span>
        {item.hasPodcast ? (
          <span className="forum-stat">
            <Headphones size={15} /> Подкаст
          </span>
        ) : null}
      </div>
      <h3>{item.title}</h3>
      <p className="forum-card__body">{item.lead}</p>
    </Link>
  );
}

// Мини-профиль текущего пользователя + связанные разделы (правая колонка ленты).
export function AsideProfile({
  name,
  avatarUrl,
  companyType,
  isPlatformStaff,
  platformRoles,
  verified,
  summary,
  weeklyExperts,
}: {
  name: string;
  avatarUrl: string | null;
  companyType: ForumAuthorReputation["companyType"];
  isPlatformStaff?: boolean;
  platformRoles?: readonly PlatformRole[];
  verified: boolean;
  summary: ForumSummary["currentUser"];
  weeklyExperts: ForumSummary["weeklyExperts"];
}) {
  const profileRoleLabel = forumProfileRoleLabel({ companyType, isPlatformStaff, platformRoles, verified });
  return (
    <>
      <div className="card forum-profile-card">
        <h4>Ваш профиль</h4>
        <div className="forum-prof">
          <span className="forum-avatar forum-avatar--profile" aria-hidden="true">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initialsFromName(name)}
          </span>
          <div>
            <b>{name}</b>
            {profileRoleLabel ? (
              <span className="forum-profile-role">
                <BadgeCheck size={15} /> {profileRoleLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="forum-stat-grid">
          <div className="forum-stat-cell">
            <span>Ответов</span>
            <b>{summary.answersCount}</b>
          </div>
          <div className="forum-stat-cell">
            <span>Решено</span>
            <b>{summary.solvedAnswersCount}</b>
          </div>
        </div>
        <p className="forum-profile-hint">
          <Award size={20} aria-hidden="true" />
          <span>Ответы, выбранные решением, повышают вашу репутацию на форуме</span>
        </p>
        <Link href="/forum/ask" className="button forum-profile-cta">
          <Plus size={22} aria-hidden="true" /> Задать вопрос
        </Link>
      </div>

      <div className="card forum-related-card">
        <h4>Связанные разделы</h4>
        <div className="forum-links">
          <Link href="/news">
            <Newspaper size={18} /> Новости <span className="sub">пульс</span>
          </Link>
          <Link href="/indices">
            <LineChart size={18} /> Индексы цен <span className="sub">цифры</span>
          </Link>
        </div>
      </div>

      <WeeklyExpertsCard experts={weeklyExperts} />
    </>
  );
}

function WeeklyExpertsCard({ experts }: { experts: ForumSummary["weeklyExperts"] }) {
  return (
    <div className="card forum-experts-card">
      <h4>Эксперты недели</h4>
      {experts.length > 0 ? (
        <div className="forum-experts-list">
          {experts.map((expert, index) => (
            <div key={expert.author.userId} className="forum-expert-row">
              <span className="forum-expert-rank" aria-label={`${index + 1} место`}>
                {index + 1}
              </span>
              <span className="forum-expert-name">{expert.author.name}</span>
              <span className="forum-expert-score">+{expert.solvedAnswersCount}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="forum-experts-empty">На этой неделе ещё нет ответов, выбранных решением.</p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  ArrowUp,
  BadgeCheck,
  Bell,
  CircleCheck,
  Clock,
  Eye,
  Headphones,
  HelpCircle,
  LineChart,
  MessageSquare,
  Newspaper,
  Pin,
  Store,
} from "lucide-react";
import type {
  ForumAuthorReputation,
  ForumPinnedNews,
  ForumQuestionListItem,
  ForumQuestionStatus,
  ForumTaxonomyValue,
} from "@ecoplatform/shared";
import {
  companyRoleLabel,
  forumStatusLabel,
  forumStatusVariant,
  initialsFromName,
  relativeTime,
} from "./forum-helpers";

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
      {author.avatarUrl ? <img src={author.avatarUrl} alt="" /> : initialsFromName(author.name)}
    </span>
  );
}

// Репутация автора: имя + роль + «проверенный» + рейтинг + сделки + решено на форуме.
export function Reputation({ author }: { author: ForumAuthorReputation }) {
  const role = companyRoleLabel(author.companyType);
  return (
    <span className="forum-who">
      <Avatar author={author} />
      <span>{author.name}</span>
      {role ? <span>· {role}</span> : null}
      {author.verified ? (
        <span className="forum-verified" title="Проверенная компания">
          <BadgeCheck size={14} /> проверенный
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
    <Link href={`/forum/q/${question.id}`} className={`forum-card forum-card--${variant}`}>
      <div className="forum-tags">
        <StatusBadge status={question.status} />
        <TagChips rawMaterial={question.rawMaterial} questionType={question.questionType} />
      </div>
      <h3>{question.title}</h3>
      {question.status === "solved" && question.acceptedAnswerExcerpt ? (
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
            <ArrowUp size={15} /> {question.topVotes}
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

export function PinnedNewsCard({ item }: { item: ForumPinnedNews }) {
  return (
    <Link href={`/news/${item.slug}`} className="forum-pinned">
      <div className="forum-tags">
        <span className="forum-badge forum-badge--pin">
          <Pin size={14} /> Закреплено
        </span>
        <span className="forum-chip">
          <Newspaper size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
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
  companyType,
  verified,
}: {
  name: string;
  companyType: ForumAuthorReputation["companyType"];
  verified: boolean;
}) {
  const role = companyRoleLabel(companyType);
  return (
    <>
      <div className="card">
        <h4>Ваш профиль</h4>
        <div className="forum-prof">
          <span className="forum-avatar">{initialsFromName(name)}</span>
          <div>
            <b>{name}</b>
            {verified ? (
              <span className="forum-verified">
                <BadgeCheck size={14} /> {role ? `Проверенный · ${role}` : "Проверенный"}
              </span>
            ) : role ? (
              <span className="forum-rep">{role}</span>
            ) : null}
          </div>
        </div>
        <Link href="/forum/ask" className="button" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
          Задать вопрос
        </Link>
      </div>

      <div className="card">
        <h4>Связанные разделы</h4>
        <div className="forum-links">
          <Link href="/news">
            <Newspaper size={18} /> Новости <span className="sub">пульс</span>
          </Link>
          <Link href="/indices">
            <LineChart size={18} /> Индексы цен <span className="sub">цифры</span>
          </Link>
          <Link href="/marketplace">
            <Store size={18} /> Объявления <span className="sub">сделки</span>
          </Link>
        </div>
        <div className="forum-stat" style={{ marginTop: 12, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
          <Bell size={15} /> Уведомления об ответах — в колокольчике
        </div>
      </div>
    </>
  );
}

"use client";
import "../../styles/forum.css";

// Карточка вопроса: тело + ответы (голос «полезно», принятие решения автором,
// правка/удаление своего, жалоба) + композер ответа + подписка. Тело — простой
// текст (абзацы). Данные обновляются точечно (голос) или перезагрузкой (ответ/принятие).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  Bell,
  BellOff,
  CircleCheck,
  Clock,
  Eye,
  Flag,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import type { ForumAnswerItem, ForumQuestionDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { Reputation, StatusBadge, TagChips } from "./components";
import { bodyParagraphs, relativeTime } from "./forum-helpers";

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Спам" },
  { value: "offensive_content", label: "Оскорбления" },
  { value: "false_information", label: "Недостоверная информация" },
  { value: "contact_data", label: "Контакты / реклама" },
  { value: "illegal_content", label: "Противоправный контент" },
  { value: "other", label: "Другое" },
];

const DEFAULT_REPORT_REASON = "spam";

type Flash = { text: string; error?: boolean } | null;

export function ForumQuestionView({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { data, setData, state, errorMessage } = useApiQuery<ForumQuestionDetail | null>(
    `forum-q-${id}`,
    () => api.forum.question(id),
    null,
  );

  const [answerBody, setAnswerBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  const refresh = async () => {
    const fresh = await api.forum.question(id);
    setData(fresh);
  };

  const isStaff = (user?.platformRoles?.length ?? 0) > 0;

  if (state === "unauthenticated") return <AuthRequired title="Форум" />;
  if (state === "forbidden") return <AccessClosed title="Форум" />;
  if (state === "error") return <ErrorState title="Форум" message={errorMessage} />;
  if (state === "loading" || !data) {
    return (
      <AppShell>
        <section className="page forum-page">
          <p className="forum-count">Загрузка…</p>
        </section>
      </AppShell>
    );
  }

  const detail = data;
  const canAccept = detail.isAuthor || isStaff;

  const handleVote = async (answer: ForumAnswerItem) => {
    try {
      const result = await api.forum.vote(answer.id);
      setData((current) =>
        current
          ? {
              ...current,
              answers: current.answers.map((item) =>
                item.id === answer.id ? { ...item, votesCount: result.votesCount, votedByMe: result.voted } : item,
              ),
            }
          : current,
      );
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    }
  };

  const handleAccept = async (answer: ForumAnswerItem) => {
    try {
      await api.forum.accept(id, answer.id);
      await refresh();
      setFlash({ text: "Ответ отмечен решением." });
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    }
  };

  const handleSubmitAnswer = async () => {
    const body = answerBody.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      await api.forum.answer(id, { body });
      setAnswerBody("");
      await refresh();
      setFlash({ text: "Ответ опубликован." });
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubscribe = async () => {
    try {
      if (detail.subscribed) {
        await api.forum.unsubscribe(id);
      } else {
        await api.forum.subscribe(id);
      }
      setData((current) => (current ? { ...current, subscribed: !current.subscribed } : current));
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    }
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Удалить вопрос вместе со всеми ответами?")) return;
    try {
      await api.forum.deleteQuestion(id);
      router.push("/forum");
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    }
  };

  const handleReport = async (
    entityType: "forum_question" | "forum_answer",
    entityId: string,
    reasonCode: string,
    comment: string,
  ) => {
    await api.moderation.createComplaint({ entityType, entityId, reasonCode, comment: comment || undefined });
    setFlash({ text: "Жалоба отправлена в модерацию." });
  };

  return (
    <AppShell>
      <section className="page forum-page">
        <div className="forum-detail">
          <Link href="/forum" className="forum-back">
            <ArrowLeft size={16} /> К форуму
          </Link>

          {flash ? <div className={`forum-flash${flash.error ? " is-error" : ""}`}>{flash.text}</div> : null}

          <div className="forum-tags">
            <StatusBadge status={detail.status} />
            <TagChips rawMaterial={detail.rawMaterial} questionType={detail.questionType} />
          </div>
          <h1>{detail.title}</h1>
          <div className="forum-meta">
            <Reputation author={detail.author} />
            <span className="forum-stat">
              <Clock size={15} /> {relativeTime(detail.createdAt)}
            </span>
            <span className="forum-stat">
              <Eye size={15} /> {detail.views}
            </span>
            <button type="button" className="forum-text-button" onClick={handleSubscribe}>
              {detail.subscribed ? <BellOff size={15} /> : <Bell size={15} />}
              {detail.subscribed ? "Отписаться" : "Подписаться на ответы"}
            </button>
            {detail.canManage ? (
              <button type="button" className="forum-text-button is-danger" onClick={handleDeleteQuestion}>
                <Trash2 size={15} /> Удалить вопрос
              </button>
            ) : null}
          </div>

          <div className="forum-q-body">
            {bodyParagraphs(detail.body).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
            {!detail.isAuthor ? (
              <ReportControl
                onSubmit={(reason, comment) => handleReport("forum_question", detail.id, reason, comment)}
                label="Пожаловаться на вопрос"
              />
            ) : null}
          </div>

          <div className="forum-ans-head">
            <h2>
              {detail.answersCount} {pluralAnswers(detail.answersCount)}
            </h2>
          </div>

          {detail.answers.map((answer) => (
            <AnswerItem
              key={answer.id}
              answer={answer}
              isMine={answer.author.userId === user?.id}
              canAccept={canAccept && !answer.isAccepted}
              onVote={() => handleVote(answer)}
              onAccept={() => handleAccept(answer)}
              onChanged={refresh}
              onReport={(reason, comment) => handleReport("forum_answer", answer.id, reason, comment)}
              onFlash={setFlash}
            />
          ))}

          <div className="forum-composer">
            <label htmlFor="forum-answer">Ваш ответ</label>
            <textarea
              id="forum-answer"
              className="textarea"
              rows={5}
              value={answerBody}
              onChange={(event) => setAnswerBody(event.target.value)}
              placeholder="Поделитесь тем, что сработало у вас на практике"
            />
            <div>
              <button
                type="button"
                className="button"
                onClick={handleSubmitAnswer}
                disabled={submitting || answerBody.trim().length === 0}
              >
                <Send size={16} /> Опубликовать ответ
              </button>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function AnswerItem({
  answer,
  isMine,
  canAccept,
  onVote,
  onAccept,
  onChanged,
  onReport,
  onFlash,
}: {
  answer: ForumAnswerItem;
  isMine: boolean;
  canAccept: boolean;
  onVote: () => void;
  onAccept: () => void;
  onChanged: () => Promise<void>;
  onReport: (reason: string, comment: string) => Promise<void>;
  onFlash: (flash: Flash) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer.body);
  const [busy, setBusy] = useState(false);

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.forum.updateAnswer(answer.id, { body });
      setEditing(false);
      await onChanged();
    } catch (error) {
      onFlash({ text: messageFrom(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить ответ?")) return;
    try {
      await api.forum.deleteAnswer(answer.id);
      await onChanged();
    } catch (error) {
      onFlash({ text: messageFrom(error), error: true });
    }
  };

  return (
    <article className={`forum-answer${answer.isAccepted ? " forum-answer--best" : ""}`}>
      <div className="forum-vote">
        <button type="button" aria-pressed={answer.votedByMe} aria-label="Полезно" onClick={onVote}>
          <ArrowUp size={18} />
        </button>
        <b>{answer.votesCount}</b>
      </div>
      <div>
        {answer.isAccepted ? (
          <span className="forum-best-flag">
            <CircleCheck size={17} /> Лучший ответ · отмечен автором
          </span>
        ) : null}

        {editing ? (
          <>
            <textarea className="textarea" rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="forum-answer-actions">
              <button type="button" className="button" onClick={saveEdit} disabled={busy}>
                Сохранить
              </button>
              <button type="button" className="forum-text-button" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </>
        ) : (
          bodyParagraphs(answer.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)
        )}

        <div className="forum-meta">
          <Reputation author={answer.author} />
        </div>

        {!editing ? (
          <div className="forum-answer-actions">
            {canAccept ? (
              <button type="button" className="forum-text-button" onClick={onAccept}>
                <CircleCheck size={15} /> Отметить решением
              </button>
            ) : null}
            {isMine ? (
              <button type="button" className="forum-text-button" onClick={() => setEditing(true)}>
                <Pencil size={15} /> Изменить
              </button>
            ) : null}
            {answer.canManage ? (
              <button type="button" className="forum-text-button is-danger" onClick={remove}>
                <Trash2 size={15} /> Удалить
              </button>
            ) : null}
            {!isMine ? <ReportControl onSubmit={onReport} label="Пожаловаться" /> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ReportControl({
  onSubmit,
  label,
}: {
  onSubmit: (reason: string, comment: string) => Promise<void>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(DEFAULT_REPORT_REASON);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="forum-text-button" onClick={() => setOpen(true)}>
        <Flag size={15} /> {label}
      </button>
    );
  }

  const submit = async () => {
    if (reason === "other" && !comment.trim()) return;
    setBusy(true);
    try {
      await onSubmit(reason, comment.trim());
      setOpen(false);
      setComment("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="forum-report">
      <div className="forum-report__row">
        <select className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="textarea"
        rows={2}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={reason === "other" ? "Опишите причину (обязательно)" : "Комментарий (необязательно)"}
      />
      <div className="forum-report__row">
        <button type="button" className="button" onClick={submit} disabled={busy}>
          Отправить жалобу
        </button>
        <button type="button" className="forum-text-button" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function pluralAnswers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "ответ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "ответа";
  return "ответов";
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Не удалось выполнить действие";
}

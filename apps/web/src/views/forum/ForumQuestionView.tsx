"use client";
import "../../styles/forum.css";

// Карточка вопроса: тело + ответы (голос «полезно», принятие решения автором,
// правка/удаление своего, жалоба) + композер ответа + подписка. Тело — простой
// текст (абзацы). Данные обновляются точечно (голос) или перезагрузкой (ответ/принятие).

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, BellOff, CircleCheck, Clock, Eye, Flag, MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { ForumAnswerItem, ForumAnswerReplyItem, ForumQuestionDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import {
  ArrowUpActionIcon,
  SendActionIcon,
  type AnimatedNavIconHandle,
  useAnimatedNavIconPlayback,
} from "../../components/app-shell/nav-icons";
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
const VIEW_RECORD_WINDOW_MS = 10_000;
const FORUM_TEXTAREA_MAX_HEIGHT = 168;
const recentlyRecordedViews = new Map<string, number>();

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

  useEffect(() => {
    if (state !== "ready" || !data || data.id !== id) return;
    if (!shouldRecordQuestionView(id)) return;

    let isActive = true;
    api.forum
      .recordView(id)
      .then((result) => {
        if (!isActive) return;
        setData((current) => (current && current.id === id ? { ...current, views: result.views } : current));
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [data, id, setData, state]);

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

  const handleSubmitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

          <div className="forum-q-body">
            <div className="forum-tags">
              <StatusBadge status={detail.status} />
              <TagChips rawMaterial={detail.rawMaterial} questionType={detail.questionType} />
            </div>
            <h1>{detail.title}</h1>
            <div className="forum-q-text">
              {bodyParagraphs(detail.body).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
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
              {!detail.isAuthor ? (
                <ReportControl
                  onSubmit={(reason, comment) => handleReport("forum_question", detail.id, reason, comment)}
                  label="Пожаловаться на вопрос"
                />
              ) : null}
            </div>
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
              currentUserId={user?.id ?? null}
              canAccept={canAccept && !answer.isAccepted}
              onVote={() => handleVote(answer)}
              onAccept={() => handleAccept(answer)}
              onChanged={refresh}
              onReport={(answerId, reason, comment) => handleReport("forum_answer", answerId, reason, comment)}
              onFlash={setFlash}
            />
          ))}

          <div className="forum-composer">
            <label htmlFor="forum-answer">Ваш ответ</label>
            <form className="forum-inline-composer" onSubmit={handleSubmitAnswer}>
              <AutoSizeTextarea
                id="forum-answer"
                value={answerBody}
                onChange={setAnswerBody}
                placeholder="Поделитесь тем, что сработало у вас на практике"
              />
              <button
                type="submit"
                className="button forum-inline-submit forum-inline-submit--icon"
                disabled={submitting || answerBody.trim().length === 0}
                aria-label="Опубликовать ответ"
                title="Опубликовать ответ"
              >
                <SendActionIcon size={20} />
              </button>
            </form>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function AnswerItem({
  answer,
  isMine,
  currentUserId,
  canAccept,
  onVote,
  onAccept,
  onChanged,
  onReport,
  onFlash,
}: {
  answer: ForumAnswerItem;
  isMine: boolean;
  currentUserId: string | null;
  canAccept: boolean;
  onVote: () => void;
  onAccept: () => void;
  onChanged: () => Promise<void>;
  onReport: (answerId: string, reason: string, comment: string) => Promise<void>;
  onFlash: (flash: Flash) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer.body);
  const [busy, setBusy] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const voteIconRef = useRef<AnimatedNavIconHandle | null>(null);
  const voteIconPlayback = useAnimatedNavIconPlayback(voteIconRef);
  const repliesCount = answer.replies.length;

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

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = replyBody.trim();
    if (!body) return;
    setReplyBusy(true);
    try {
      await api.forum.reply(answer.id, { body });
      setReplyBody("");
      setReplyOpen(false);
      setDiscussionOpen(true);
      await onChanged();
      onFlash({ text: "Ответ опубликован в обсуждении." });
    } catch (error) {
      onFlash({ text: messageFrom(error), error: true });
    } finally {
      setReplyBusy(false);
    }
  };

  return (
    <article className={`forum-answer${answer.isAccepted ? " forum-answer--best" : ""}`}>
      <div className="forum-vote">
        <button
          type="button"
          aria-pressed={answer.votedByMe}
          aria-label="Отметить этот ответ как наиболее подходящий"
          title="Отметить этот ответ, как наиболее подходящий."
          onClick={onVote}
          {...voteIconPlayback}
        >
          <ArrowUpActionIcon ref={voteIconRef} size={20} />
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
            <button type="button" className="forum-text-button" onClick={() => setReplyOpen((open) => !open)}>
              <MessageSquare size={15} /> Ответить
            </button>
            {repliesCount > 0 ? (
              <button
                type="button"
                className="forum-text-button"
                onClick={() => setDiscussionOpen((open) => !open)}
                aria-expanded={discussionOpen}
              >
                <MessageSquare size={15} />{" "}
                {discussionOpen ? "Скрыть обсуждение" : `Показать обсуждение (${repliesCount})`}
              </button>
            ) : null}
            {!isMine ? (
              <ReportControl
                onSubmit={(reason, comment) => onReport(answer.id, reason, comment)}
                label="Пожаловаться"
              />
            ) : null}
          </div>
        ) : null}

        {replyOpen ? (
          <form className="forum-answer-reply-form" onSubmit={submitReply}>
            <label className="forum-sr-only" htmlFor={`forum-reply-${answer.id}`}>
              Ответить на ответ
            </label>
            <AutoSizeTextarea
              id={`forum-reply-${answer.id}`}
              value={replyBody}
              onChange={setReplyBody}
              placeholder="Добавьте уточнение или возражение"
            />
            <div className="forum-answer-actions">
              <button type="submit" className="button forum-inline-submit" disabled={replyBusy || !replyBody.trim()}>
                <SendActionIcon size={18} /> <span>Опубликовать</span>
              </button>
              <button type="button" className="forum-text-button" onClick={() => setReplyOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        ) : null}

        {discussionOpen && repliesCount > 0 ? (
          <div className="forum-answer-thread" aria-label="Обсуждение ответа">
            {answer.replies.map((reply) => (
              <AnswerReplyItem
                key={reply.id}
                reply={reply}
                isMine={reply.author.userId === currentUserId}
                onChanged={onChanged}
                onReport={(reason, comment) => onReport(reply.id, reason, comment)}
                onFlash={onFlash}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AnswerReplyItem({
  reply,
  isMine,
  onChanged,
  onReport,
  onFlash,
}: {
  reply: ForumAnswerReplyItem;
  isMine: boolean;
  onChanged: () => Promise<void>;
  onReport: (reason: string, comment: string) => Promise<void>;
  onFlash: (flash: Flash) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [busy, setBusy] = useState(false);

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.forum.updateAnswer(reply.id, { body });
      setEditing(false);
      await onChanged();
    } catch (error) {
      onFlash({ text: messageFrom(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Удалить реплику из обсуждения?")) return;
    try {
      await api.forum.deleteAnswer(reply.id);
      await onChanged();
    } catch (error) {
      onFlash({ text: messageFrom(error), error: true });
    }
  };

  return (
    <article className="forum-answer-reply">
      <div className="forum-meta">
        <Reputation author={reply.author} />
        <span className="forum-stat">
          <Clock size={15} /> {relativeTime(reply.createdAt)}
        </span>
      </div>

      {editing ? (
        <>
          <AutoSizeTextarea
            id={`forum-reply-edit-${reply.id}`}
            value={draft}
            onChange={setDraft}
            ariaLabel="Текст реплики"
          />
          <div className="forum-answer-actions">
            <button type="button" className="button" onClick={saveEdit} disabled={busy || !draft.trim()}>
              Сохранить
            </button>
            <button type="button" className="forum-text-button" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </>
      ) : (
        bodyParagraphs(reply.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)
      )}

      {!editing ? (
        <div className="forum-answer-actions">
          {isMine ? (
            <button type="button" className="forum-text-button" onClick={() => setEditing(true)}>
              <Pencil size={15} /> Изменить
            </button>
          ) : null}
          {reply.canManage ? (
            <button type="button" className="forum-text-button is-danger" onClick={remove}>
              <Trash2 size={15} /> Удалить
            </button>
          ) : null}
          {!isMine ? <ReportControl onSubmit={onReport} label="Пожаловаться" /> : null}
        </div>
      ) : null}
    </article>
  );
}

function AutoSizeTextarea({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, FORUM_TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > FORUM_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  return (
    <textarea
      id={id}
      className="forum-auto-textarea"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      ref={textareaRef}
      rows={1}
    />
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
          <SendActionIcon size={18} />
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

function shouldRecordQuestionView(questionId: string): boolean {
  const now = Date.now();
  const lastRecordedAt = recentlyRecordedViews.get(questionId);
  if (lastRecordedAt && now - lastRecordedAt < VIEW_RECORD_WINDOW_MS) {
    return false;
  }
  recentlyRecordedViews.set(questionId, now);
  return true;
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Не удалось выполнить действие";
}

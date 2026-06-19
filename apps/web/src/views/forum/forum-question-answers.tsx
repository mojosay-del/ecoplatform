"use client";

import { useRef, useState, type FormEvent } from "react";
import { CircleCheck, Clock, MessageSquare, Pencil, Trash2 } from "lucide-react";
import type { ForumAnswerItem, ForumAnswerReplyItem } from "@ecoplatform/shared";
import {
  ArrowUpActionIcon,
  SendActionIcon,
  type AnimatedNavIconHandle,
  useAnimatedNavIconPlayback,
} from "../../components/app-shell/nav-icons";
import { api } from "../../lib/api";
import { Reputation } from "./components";
import { AutoSizeTextarea, ReportControl } from "./forum-question-controls";
import type { ForumQuestionFlash } from "./forum-question-types";
import { messageFrom } from "./forum-question-utils";
import { bodyParagraphs, relativeTime } from "./forum-helpers";

export function AnswerItem({
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
  onFlash: (flash: ForumQuestionFlash) => void;
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
  onFlash: (flash: ForumQuestionFlash) => void;
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

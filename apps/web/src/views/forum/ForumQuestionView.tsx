"use client";
import "../../styles/forum.css";

// Карточка вопроса: тело + ответы (голос «полезно», принятие решения автором,
// правка/удаление своего, жалоба) + композер ответа + подписка. Тело — простой
// текст (абзацы). Данные обновляются точечно (голос) или перезагрузкой (ответ/принятие).

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, BellOff, Clock, Eye, Trash2 } from "lucide-react";
import type { ForumAnswerItem, ForumQuestionDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { SendActionIcon } from "../../components/app-shell/nav-icons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { invalidateQueryFamilies, queryKeys } from "../../lib/query";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { Reputation, StatusBadge, TagChips } from "./components";
import { AnswerItem } from "./forum-question-answers";
import { AutoSizeTextarea, ReportControl } from "./forum-question-controls";
import type { ForumQuestionFlash } from "./forum-question-types";
import { messageFrom, pluralAnswers, shouldRecordQuestionView } from "./forum-question-utils";
import { bodyParagraphs, relativeTime } from "./forum-helpers";

export function ForumQuestionView({ id }: { id: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, setData, state, errorMessage } = useApiQuery<ForumQuestionDetail | null>(
    queryKeys.forum.detail(id),
    () => api.forum.question(id),
    null,
  );

  const [answerBody, setAnswerBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<ForumQuestionFlash>(null);

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
    queryClient.setQueryData(queryKeys.forum.detail(id), fresh);
    await invalidateQueryFamilies(queryClient, ["forum"]);
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
      await invalidateQueryFamilies(queryClient, ["forum"]);
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.forum.detail(id) });
    } catch (error) {
      setFlash({ text: messageFrom(error), error: true });
    }
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Удалить вопрос вместе со всеми ответами?")) return;
    try {
      await api.forum.deleteQuestion(id);
      await invalidateQueryFamilies(queryClient, ["forum"]);
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

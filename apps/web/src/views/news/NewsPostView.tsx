"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { StatusPill } from "../../components/StatusPill";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  AccessClosed,
  AuthRequired,
  ErrorState,
  NewsMetaItem,
  formatNewsDate,
  withUpdatedCommentLike,
  withUpdatedNewsLike,
  type ApiState,
} from "../shared";
import { ContentBlocks } from "../content-blocks";
import { NewsLikeButton } from "./NewsArticleContent";
import { CommentsSection } from "./comments";

export function NewsPostView({ slug, preview = false }: { slug: string; preview?: boolean }) {
  const { token } = useAuth();
  const [post, setPost] = useState<NewsPostDetail | null>(null);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [commentLikePendingId, setCommentLikePendingId] = useState<string | null>(null);

  async function load() {
    if (!token) {
      setState("unauthenticated");
      setPost(null);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    try {
      const data = await api.news.get(slug, { preview });
      setPost(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить новость");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token, preview]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !post || !commentText.trim()) return;

    await api.news.addComment(post.id, { text: commentText.trim() });
    setCommentText("");
    setResultMessage("Комментарий опубликован.");
    await load();
  }

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reportingCommentId) return;

    await api.moderation.createComplaint({
      entityType: "news_comment",
      entityId: reportingCommentId,
      reasonCode: reportReason,
      comment: reportComment.trim() || undefined,
    });
    setReportingCommentId(null);
    setReportReason("offensive_content");
    setReportComment("");
    setResultMessage("Жалоба отправлена модератору.");
  }

  async function togglePostLike() {
    if (!token || !post || likePending) return;

    setLikePending(true);
    try {
      const result = await api.news.like(post.id);
      setPost((current) => (current ? withUpdatedNewsLike(current, result) : current));
    } finally {
      setLikePending(false);
    }
  }

  async function toggleCommentLike(commentId: string) {
    if (!token || !post || commentLikePendingId) return;

    setCommentLikePendingId(commentId);
    try {
      const result = await api.news.likeComment(commentId);
      setPost((current) => (current ? withUpdatedCommentLike(current, commentId, result) : current));
    } finally {
      setCommentLikePendingId(null);
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

  const publishedDate = post?.firstPublishedAt ? new Date(post.firstPublishedAt) : null;

  return (
    <AppShell>
      <section className="page">
        <Link className="button secondary page-back" href="/news">
          ← Назад к новостям
        </Link>
        {preview ? (
          <StatusPill as="p" className="cms-preview-banner" variant="warning">
            Предпросмотр новости: комментарии и реакции отключены.
          </StatusPill>
        ) : null}
        {state === "loading" || !post ? (
          <p className="page-subtitle">Загрузка…</p>
        ) : (
          <>
            <header className="page-header">
              <h1 className="page-title">{post.title}</h1>
              <p className="page-subtitle">{post.lead}</p>
            </header>
            <article className="content-article">
              <ContentBlocks blocks={post.blocks ?? []} />
            </article>
            <div className="news-article-meta news-article-meta-page">
              {publishedDate ? (
                <time dateTime={publishedDate.toISOString()}>{formatNewsDate(publishedDate)}</time>
              ) : preview ? (
                <span>Черновик ещё не опубликован</span>
              ) : null}
              {!preview ? (
                <>
                  <NewsMetaItem count={post._count?.comments ?? 0} icon={MessageCircle} label="Комментарии" />
                  <NewsLikeButton post={post} pending={likePending} onToggle={togglePostLike} />
                </>
              ) : null}
            </div>
            {!preview ? (
              <CommentsSection
                comments={post.comments ?? []}
                commentsCount={post._count?.comments ?? 0}
                commentText={commentText}
                onCommentTextChange={setCommentText}
                onSubmitComment={submitComment}
                resultMessage={resultMessage}
                reportingCommentId={reportingCommentId}
                setReportingCommentId={setReportingCommentId}
                reportReason={reportReason}
                setReportReason={setReportReason}
                reportComment={reportComment}
                setReportComment={setReportComment}
                onSubmitComplaint={submitComplaint}
                onToggleCommentLike={toggleCommentLike}
                commentLikePendingId={commentLikePendingId}
              />
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import "../content-blocks/content-article.css";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { StatusPill } from "../../components/StatusPill";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { queryKeys } from "../../lib/query";
import {
  AccessClosed,
  AuthRequired,
  ErrorState,
  NewsMetaItem,
  formatNewsDate,
  withUpdatedCommentLike,
  withUpdatedNewsLike,
  useApiQuery,
} from "../shared";
import { ContentBlocks } from "../content-blocks";
import { NewsLikeButton } from "./NewsArticleContent";
import { CommentsSection } from "./comments";

export function NewsPostView({ slug }: { slug: string }) {
  // Предпросмотр черновика определяется на клиенте (?preview=1|true). На сервере
  // searchParams не читаем — это позволяет странице оставаться ISR (см. page.tsx).
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("preview");
  const preview = previewParam === "1" || previewParam === "true";
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: post,
    setData: setPost,
    state,
    errorMessage,
    refetch,
  } = useApiQuery(
    queryKeys.news.detail(slug, preview),
    () => api.news.get(slug, { preview }),
    null as NewsPostDetail | null,
  );
  const [commentText, setCommentText] = useState("");
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [commentLikePendingId, setCommentLikePendingId] = useState<string | null>(null);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !post || !commentText.trim()) return;

    const scrollTop = window.scrollY;
    await api.news.addComment(post.id, { text: commentText.trim() });
    setCommentText("");
    await refetch();
    await queryClient.invalidateQueries({ queryKey: queryKeys.news.lists() });
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
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
  }

  async function togglePostLike() {
    if (!token || !post || likePending) return;

    setLikePending(true);
    try {
      const result = await api.news.like(post.id);
      setPost((current) => {
        const updatedPost = current ? withUpdatedNewsLike(current, result) : current;
        if (updatedPost) {
          queryClient.setQueryData(queryKeys.news.detail(updatedPost.slug, preview), updatedPost);
        }
        return updatedPost;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.news.lists() });
    } finally {
      setLikePending(false);
    }
  }

  async function toggleCommentLike(commentId: string) {
    if (!token || !post || commentLikePendingId) return;

    setCommentLikePendingId(commentId);
    try {
      const result = await api.news.likeComment(commentId);
      setPost((current) => {
        const updatedPost = current ? withUpdatedCommentLike(current, commentId, result) : current;
        if (updatedPost) {
          queryClient.setQueryData(queryKeys.news.detail(updatedPost.slug, preview), updatedPost);
        }
        return updatedPost;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.news.lists() });
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
  const isExtended = post?.accessTier === "extended";
  // Новость, открытая как закреплённое обсуждение форума (?from=forum): возвращаем
  // на форум и оформляем в стиле обычного обсуждения (контейнер .forum-detail).
  const fromForum = searchParams.get("from") === "forum";

  const body = (
    <div className={`news-detail-surface${isExtended ? " is-extended" : ""}`}>
      {preview ? (
        <StatusPill as="p" className="cms-preview-banner" variant="warning">
          Предпросмотр новости: комментарии и реакции отключены.
        </StatusPill>
      ) : null}
      {state === "loading" || !post ? (
        <p className="page-subtitle">Загрузка…</p>
      ) : (
        <>
          {isExtended ? <span className="news-tier-badge">Расширенная</span> : null}
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
              commentText={commentText}
              onCommentTextChange={setCommentText}
              onSubmitComment={submitComment}
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
    </div>
  );

  if (fromForum) {
    return (
      <AppShell>
        <section className="page forum-page">
          <div className="forum-detail">
            <Link className="forum-back" href="/forum">
              <ArrowLeft size={16} /> К форуму
            </Link>
            {body}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <Link className="button secondary page-back" href="/news">
          ← Назад к новостям
        </Link>
        {body}
      </section>
    </AppShell>
  );
}

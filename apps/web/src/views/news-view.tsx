"use client";

// Раздел «Новости»: лента, модалка с детальной новостью, deep-link страница
// /news/[slug] (NewsPostView). Все три тесно связаны общими сабкомпонентами
// (Comments, LikeButton, ReportDialog) — поэтому живут в одном файле.

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState, type FormEvent } from "react";
import { Flag, MessageCircle, Send, ThumbsUp, X } from "lucide-react";
import type { NewsCommentDecorated, NewsListItem, NewsPostDetail } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { ApiError, api, preferredFileAssetImageUrl, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCoverAssets } from "../lib/use-cover-assets";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import {
  AccessClosed,
  AuthRequired,
  CommentAvatar,
  ErrorState,
  NewsMetaItem,
  formatCommentDate,
  formatNewsDate,
  getCommentAuthor,
  getNewsFeedSnapshot,
  withUpdatedCommentLike,
  withUpdatedNewsLike,
  type ApiState,
  type LikeResult,
} from "./_shared";
import { ContentBlocks } from "./content-blocks";

const NEWS_PAGE_SIZE = 20;

export function NewsView() {
  const feed = useInfiniteApiQuery("news-feed", NEWS_PAGE_SIZE, ({ limit, offset }) =>
    api.news.list({ limit, offset }),
  );
  const { items, setItems, state, errorMessage, hasMore, isLoadingMore, sentinelRef } = feed;
  const covers = useCoverAssets(items);
  const router = useRouter();
  const searchParams = useSearchParams();
  const openedSlug = searchParams.get("post");

  // Модалка открывается через query ?post=slug — это даёт shareable URL,
  // back/forward в браузере и закрытие по Esc через router.replace('/news').
  function openPost(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("post", slug);
    router.push(`/news?${params.toString()}`, { scroll: false });
  }

  function closePost() {
    router.push("/news", { scroll: false });
  }

  function updatePostInFeed(updatedPost: NewsPostDetail) {
    setItems((current) =>
      current.map((post) => (post.id === updatedPost.id ? { ...post, ...getNewsFeedSnapshot(updatedPost) } : post)),
    );
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

  return (
    <AppShell>
      <section className="page">
        <header className="news-feed-header">
          <h1>Последние обновления</h1>
        </header>

        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка…
          </p>
        ) : items.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Пока нет публикаций.
          </p>
        ) : (
          <div className="news-masonry">
            {items.map((post) => {
              const cover = post.coverImageId ? covers.get(post.coverImageId) : null;
              const coverUrl = preferredFileAssetImageUrl(cover);
              const hasCover = Boolean(coverUrl);
              const publishedDate = post.firstPublishedAt ? new Date(post.firstPublishedAt) : null;
              return (
                // Раньше тут был <button>, что:
                //  1) ломало SEO (поисковики не видели shareable URL),
                //  2) ломало UX (Ctrl/Cmd-клик не открывал в новой вкладке,
                //     curl/middle-click не работали).
                // Теперь <a href> с shareable URL, при обычном клике
                // preventDefault → open modal без перезагрузки страницы.
                <a
                  className={`news-tile ${hasCover ? "news-tile-with-cover" : "news-tile-text"}`}
                  href={`/news?post=${encodeURIComponent(post.slug)}`}
                  onClick={(event) => {
                    // Ctrl/Cmd/Shift/middle-click — пускаем браузерное поведение.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    openPost(post.slug);
                  }}
                  key={post.id}
                >
                  {hasCover ? (
                    <div className="news-tile-cover">
                      {/* `fill` + parent `position: relative` (см. .news-tile-cover в globals.css);
                          `sizes` подсказывает next/image, какой preset запросить под viewport. */}
                      <Image
                        alt={cover?.originalName ?? post.title}
                        src={coverUrl!}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                  ) : null}
                  <div className="news-tile-body">
                    <span className="news-tile-category">Новости</span>
                    <h2 className="news-tile-title">{post.title}</h2>
                    <p className="news-tile-lead">{post.lead}</p>
                    <div className="news-tile-meta">
                      <NewsMetaItem count={post._count?.likes ?? 0} icon={ThumbsUp} label="Лайки" />
                      <NewsMetaItem count={post._count?.comments ?? 0} icon={MessageCircle} label="Комментарии" />
                      {publishedDate ? (
                        <time className="news-tile-date" dateTime={publishedDate.toISOString()}>
                          {formatNewsDate(publishedDate)}
                        </time>
                      ) : null}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
        <div ref={sentinelRef} aria-hidden="true" />
        {isLoadingMore ? (
          <p className="page-subtitle" style={{ textAlign: "center" }}>
            Загружаем ещё…
          </p>
        ) : null}
        {!hasMore && items.length > 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center" }}>
            Это все записи.
          </p>
        ) : null}
      </section>
      {openedSlug ? <NewsModal slug={openedSlug} onClose={closePost} onPostUpdate={updatePostInFeed} /> : null}
    </AppShell>
  );
}

function NewsModal({
  slug,
  onClose,
  onPostUpdate,
}: {
  slug: string;
  onClose: () => void;
  onPostUpdate?: (post: NewsPostDetail) => void;
}) {
  const { token } = useAuth();
  const [post, setPost] = useState<NewsPostDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [commentLikePendingId, setCommentLikePendingId] = useState<string | null>(null);

  async function load() {
    if (!token) {
      setState("forbidden");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const data = await api.news.get(slug);
      setPost(data);
      onPostUpdate?.(data);
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
  }, [slug, token]);

  // Закрытие по Esc, блокируем прокрутку и расфокусируем фон пока модалка открыта.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("news-modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("news-modal-open");
    };
  }, [onClose]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !post || !commentText.trim()) return;
    await api.news.addComment(post.id, { text: commentText.trim() });
    setCommentText("");
    setResultMessage("Комментарий опубликован.");
    await load();
  }

  async function togglePostLike() {
    if (!token || !post || likePending) return;

    setLikePending(true);
    try {
      const result = await api.news.like(post.id);
      const updatedPost = withUpdatedNewsLike(post, result);
      setPost(updatedPost);
      onPostUpdate?.(updatedPost);
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

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="news-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="news-modal">
        <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
          <X size={20} />
        </button>
        {state === "loading" ? (
          <div className="news-modal-loading">Загрузка…</div>
        ) : state === "error" ? (
          <div className="news-modal-loading">{errorMessage ?? "Ошибка."}</div>
        ) : state === "forbidden" || !post ? (
          <div className="news-modal-loading">Доступ ограничен.</div>
        ) : (
          <NewsArticleContent
            post={post}
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
            onTogglePostLike={togglePostLike}
            likePending={likePending}
            onToggleCommentLike={toggleCommentLike}
            commentLikePendingId={commentLikePendingId}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

type NewsArticleProps = {
  post: NewsPostDetail;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  resultMessage: string | null;
  reportingCommentId: string | null;
  setReportingCommentId: (id: string | null) => void;
  reportReason: string;
  setReportReason: (value: string) => void;
  reportComment: string;
  setReportComment: (value: string) => void;
  onSubmitComplaint: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePostLike: () => void;
  likePending: boolean;
  onToggleCommentLike: (commentId: string) => void;
  commentLikePendingId: string | null;
};

function NewsArticleContent({
  post,
  commentText,
  onCommentTextChange,
  onSubmitComment,
  resultMessage,
  reportingCommentId,
  setReportingCommentId,
  reportReason,
  setReportReason,
  reportComment,
  setReportComment,
  onSubmitComplaint,
  onTogglePostLike,
  likePending,
  onToggleCommentLike,
  commentLikePendingId,
}: NewsArticleProps) {
  const { token } = useAuth();
  const [cover, setCover] = useState<FileAsset | null>(null);
  const coverUrl = preferredFileAssetImageUrl(cover);
  const publishedDate = post.firstPublishedAt ? new Date(post.firstPublishedAt) : null;
  useEffect(() => {
    if (!token || !post?.coverImageId) {
      setCover(null);
      return;
    }
    api.files
      .listByIds([post.coverImageId])
      .then((result) => setCover(result[0] ?? null))
      .catch(() => setCover(null));
  }, [post?.coverImageId, token]);

  return (
    <div className="news-article">
      {coverUrl ? (
        <div className="news-article-cover">
          <Image
            alt={cover?.originalName ?? post.title}
            src={coverUrl}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            style={{ objectFit: "cover" }}
            priority
          />
        </div>
      ) : null}
      <div className="news-article-body">
        <span className="news-tile-category">Новости</span>
        <h1 className="news-article-title">{post.title}</h1>
        <p className="news-article-lead">{post.lead}</p>
        <div className="content-blocks">
          <ContentBlocks blocks={post.blocks ?? []} />
        </div>
        <div className="news-article-meta">
          {publishedDate ? <time dateTime={publishedDate.toISOString()}>{formatNewsDate(publishedDate)}</time> : null}
          <NewsMetaItem count={post._count?.comments ?? 0} icon={MessageCircle} label="Комментарии" />
          <NewsLikeButton post={post} pending={likePending} onToggle={onTogglePostLike} />
        </div>

        <CommentsSection
          comments={post.comments ?? []}
          commentsCount={post._count?.comments ?? 0}
          commentText={commentText}
          onCommentTextChange={onCommentTextChange}
          onSubmitComment={onSubmitComment}
          resultMessage={resultMessage}
          reportingCommentId={reportingCommentId}
          setReportingCommentId={setReportingCommentId}
          reportReason={reportReason}
          setReportReason={setReportReason}
          reportComment={reportComment}
          setReportComment={setReportComment}
          onSubmitComplaint={onSubmitComplaint}
          onToggleCommentLike={onToggleCommentLike}
          commentLikePendingId={commentLikePendingId}
        />
      </div>
    </div>
  );
}

function formatCommentCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} комментарий`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} комментария`;
  return `${count} комментариев`;
}

function NewsLikeButton({
  post,
  pending,
  onToggle,
}: {
  post: Pick<NewsPostDetail, "_count" | "likedByMe">;
  pending: boolean;
  onToggle: () => void;
}) {
  const likesCount = post._count?.likes ?? 0;

  return (
    <button
      className={`news-like-button ${post.likedByMe ? "active" : ""}`}
      disabled={pending}
      onClick={onToggle}
      type="button"
      aria-pressed={Boolean(post.likedByMe)}
    >
      <ThumbsUp aria-hidden="true" size={16} strokeWidth={2.2} />
      <span>{post.likedByMe ? "Нравится" : "Поставить лайк"}</span>
      <strong>{likesCount}</strong>
    </button>
  );
}

type CommentsSectionProps = {
  comments: NewsCommentDecorated[];
  commentsCount: number;
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  resultMessage: string | null;
  reportingCommentId: string | null;
  setReportingCommentId: (id: string | null) => void;
  reportReason: string;
  setReportReason: (value: string) => void;
  reportComment: string;
  setReportComment: (value: string) => void;
  onSubmitComplaint: (event: FormEvent<HTMLFormElement>) => void;
  onToggleCommentLike: (commentId: string) => void;
  commentLikePendingId: string | null;
};

function CommentsSection({
  comments,
  commentsCount,
  commentText,
  onCommentTextChange,
  onSubmitComment,
  resultMessage,
  reportingCommentId,
  setReportingCommentId,
  reportReason,
  setReportReason,
  reportComment,
  setReportComment,
  onSubmitComplaint,
  onToggleCommentLike,
  commentLikePendingId,
}: CommentsSectionProps) {
  const { user } = useAuth();

  return (
    <section className="comments-section" aria-labelledby="comments-title">
      <div className="comments-section-head">
        <div>
          <span className="comments-kicker">Обсуждение</span>
          <h2 id="comments-title">Комментарии</h2>
        </div>
        <span className="comments-counter">{formatCommentCount(commentsCount)}</span>
      </div>

      {resultMessage ? <p className="status-pill comments-status">{resultMessage}</p> : null}

      <div className="comment-list">
        {comments.length === 0 ? (
          <div className="comments-empty">Пока никто не написал комментарий.</div>
        ) : (
          comments.map((comment) => (
            <CommentCard
              comment={comment}
              key={comment.id}
              reportingCommentId={reportingCommentId}
              setReportingCommentId={setReportingCommentId}
              reportReason={reportReason}
              setReportReason={setReportReason}
              reportComment={reportComment}
              setReportComment={setReportComment}
              onSubmitComplaint={onSubmitComplaint}
              onToggleCommentLike={onToggleCommentLike}
              commentLikePendingId={commentLikePendingId}
            />
          ))
        )}
      </div>

      <form className="comment-composer" onSubmit={onSubmitComment}>
        <CommentAvatar current user={user} />
        <div className="comment-composer-body">
          <textarea
            className="comment-textarea"
            onChange={(event) => onCommentTextChange(event.target.value)}
            placeholder="Продолжить обсуждение"
            rows={3}
            value={commentText}
          />
          <div className="comment-composer-footer">
            <span>Комментарий появится после отправки</span>
            <button className="button comment-submit" disabled={!commentText.trim()} type="submit">
              <Send aria-hidden="true" size={16} />
              Опубликовать
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function CommentCard({
  comment,
  isReply = false,
  reportingCommentId,
  setReportingCommentId,
  reportReason,
  setReportReason,
  reportComment,
  setReportComment,
  onSubmitComplaint,
  onToggleCommentLike,
  commentLikePendingId,
}: {
  comment: NewsCommentDecorated;
  isReply?: boolean;
  reportingCommentId: string | null;
  setReportingCommentId: (id: string | null) => void;
  reportReason: string;
  setReportReason: (value: string) => void;
  reportComment: string;
  setReportComment: (value: string) => void;
  onSubmitComplaint: (event: FormEvent<HTMLFormElement>) => void;
  onToggleCommentLike: (commentId: string) => void;
  commentLikePendingId: string | null;
}) {
  const isReporting = reportingCommentId === comment.id;
  const author = getCommentAuthor(comment.user);
  const likesCount = comment._count?.likes ?? 0;
  const commentDate = comment.createdAt ? new Date(comment.createdAt) : null;

  function closeReportForm() {
    setReportingCommentId(null);
    setReportComment("");
  }

  return (
    <article className={`comment-card ${isReply ? "is-reply" : ""}`}>
      <CommentAvatar user={comment.user} />
      <div className="comment-bubble">
        <header className="comment-card-head">
          <div className="comment-author-meta">
            <strong>{author}</strong>
          </div>
        </header>
        <p className="comment-text">{comment.text}</p>
        <footer className="comment-card-footer">
          <div className="comment-card-actions" aria-label={`Действия с комментарием, лайков: ${likesCount}`}>
            {commentDate ? <time dateTime={commentDate.toISOString()}>{formatCommentDate(commentDate)}</time> : null}
            <button
              className={`comment-like-button ${comment.likedByMe ? "active" : ""}`}
              disabled={commentLikePendingId === comment.id}
              onClick={() => onToggleCommentLike(comment.id)}
              type="button"
              aria-label={
                comment.likedByMe ? `Убрать лайк, сейчас ${likesCount}` : `Поставить лайк, сейчас ${likesCount}`
              }
              aria-pressed={Boolean(comment.likedByMe)}
            >
              <ThumbsUp aria-hidden="true" size={14} />
              <span>{likesCount}</span>
            </button>
            <button
              className="comment-report-button"
              onClick={() => setReportingCommentId(isReporting ? null : comment.id)}
              type="button"
              aria-expanded={isReporting}
              aria-label="Пожаловаться"
              title="Пожаловаться"
            >
              <Flag aria-hidden="true" size={14} />
            </button>
          </div>
        </footer>

        {isReporting ? (
          <form className="comment-report-form" onSubmit={onSubmitComplaint}>
            <select className="select" onChange={(event) => setReportReason(event.target.value)} value={reportReason}>
              {complaintReasons.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              className="textarea small"
              onChange={(event) => setReportComment(event.target.value)}
              placeholder="Комментарий к жалобе"
              value={reportComment}
            />
            <div className="report-actions">
              <button className="button" type="submit">
                Отправить жалобу
              </button>
              <button className="button ghost" onClick={closeReportForm} type="button">
                Отмена
              </button>
            </div>
          </form>
        ) : null}

        {comment.replies?.length ? (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <CommentCard
                comment={reply}
                isReply
                key={reply.id}
                reportingCommentId={reportingCommentId}
                setReportingCommentId={setReportingCommentId}
                reportReason={reportReason}
                setReportReason={setReportReason}
                reportComment={reportComment}
                setReportComment={setReportComment}
                onSubmitComplaint={onSubmitComplaint}
                onToggleCommentLike={onToggleCommentLike}
                commentLikePendingId={commentLikePendingId}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

const complaintReasons = [
  ["contact_data", "Контактные данные"],
  ["false_information", "Недостоверная информация"],
  ["offensive_content", "Оскорбления"],
  ["spam", "Спам"],
  ["illegal_content", "Нарушает закон"],
  ["other", "Иное"],
] as const;

export function NewsPostView({ slug }: { slug: string }) {
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
      const data = await api.news.get(slug);
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
  }, [slug, token]);

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
              ) : null}
              <NewsMetaItem count={post._count?.comments ?? 0} icon={MessageCircle} label="Комментарии" />
              <NewsLikeButton post={post} pending={likePending} onToggle={togglePostLike} />
            </div>
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
          </>
        )}
      </section>
    </AppShell>
  );
}

// IndicesView переехал в ../views/indices-view.tsx — здесь реэкспорт для

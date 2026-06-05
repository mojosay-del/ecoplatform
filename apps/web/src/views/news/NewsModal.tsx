import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { withUpdatedCommentLike, withUpdatedNewsLike } from "../shared";
import { NewsArticleContent } from "./NewsArticleContent";

export function NewsModal({
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
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [commentLikePendingId, setCommentLikePendingId] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  async function load(options: { silent?: boolean } = {}) {
    if (!token) {
      setState("forbidden");
      return;
    }
    if (!options.silent) {
      setState("loading");
    }
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
    const scrollTop = backdropRef.current?.scrollTop ?? 0;
    await api.news.addComment(post.id, { text: commentText.trim() });
    setCommentText("");
    await load({ silent: true });
    window.requestAnimationFrame(() => {
      if (backdropRef.current) {
        backdropRef.current.scrollTop = scrollTop;
      }
    });
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
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="news-modal-backdrop"
      ref={backdropRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Новость"
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

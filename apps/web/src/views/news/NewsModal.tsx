import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { queryKeys } from "../../lib/query";
import { withUpdatedCommentLike, withUpdatedNewsLike } from "../shared";
import { useApiQuery } from "../shared";
import { NewsArticleContent } from "./NewsArticleContent";

const NEWS_MODAL_READY_TIMEOUT_MS = 6000;

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
  const queryClient = useQueryClient();
  const onPostUpdateRef = useRef(onPostUpdate);
  onPostUpdateRef.current = onPostUpdate;
  const {
    data: post,
    setData: setPost,
    state,
    errorMessage,
    refetch,
  } = useApiQuery(queryKeys.news.detail(slug), () => api.news.get(slug), null as NewsPostDetail | null);
  const [modalContentReady, setModalContentReady] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("offensive_content");
  const [reportComment, setReportComment] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [commentLikePendingId, setCommentLikePendingId] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (post) {
      onPostUpdateRef.current?.(post);
    }
  }, [post]);

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

  useEffect(() => {
    const modal = modalRef.current;
    if (state !== "ready" || !post || !modal) {
      setModalContentReady(false);
      return;
    }

    setModalContentReady(false);

    let settled = false;
    const cleanups: Array<() => void> = [];
    const expectedImageCount = countExpectedNewsModalImages(post);

    const allExpectedImagesReady = () => {
      const images = Array.from(modal.querySelectorAll<HTMLImageElement>("img")).filter(isBlockingModalImage);
      if (images.length < expectedImageCount) return false;
      return images.every((image) => image.complete);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      setModalContentReady(true);
    };

    const rescan = () => {
      if (settled) return;

      const images = Array.from(modal.querySelectorAll<HTMLImageElement>("img")).filter(isBlockingModalImage);
      images.forEach((image) => {
        if (image.complete || image.dataset.newsModalTracked === "true") return;

        image.dataset.newsModalTracked = "true";
        const onSettled = () => rescan();
        image.addEventListener("load", onSettled);
        image.addEventListener("error", onSettled);
        cleanups.push(() => {
          image.removeEventListener("load", onSettled);
          image.removeEventListener("error", onSettled);
          delete image.dataset.newsModalTracked;
        });
      });

      if (allExpectedImagesReady()) {
        finish();
      }
    };

    const observer = new MutationObserver(rescan);
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["src", "srcset"],
      childList: true,
      subtree: true,
    });
    cleanups.push(() => observer.disconnect());

    const fallback = window.setTimeout(finish, NEWS_MODAL_READY_TIMEOUT_MS);
    cleanups.push(() => window.clearTimeout(fallback));

    rescan();

    return () => {
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [state, post?.id, slug]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !post || !commentText.trim()) return;
    const scrollTop = backdropRef.current?.scrollTop ?? 0;
    await api.news.addComment(post.id, { text: commentText.trim() });
    setCommentText("");
    const result = await refetch();
    const freshPost = result.data ?? post;
    if (freshPost) {
      onPostUpdateRef.current?.(freshPost);
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.news.lists() });
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
      queryClient.setQueryData(queryKeys.news.detail(updatedPost.slug), updatedPost);
      onPostUpdateRef.current?.(updatedPost);
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
          queryClient.setQueryData(queryKeys.news.detail(updatedPost.slug), updatedPost);
        }
        return updatedPost;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.news.lists() });
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

  const showLoadingShell = state === "loading" || (state === "ready" && Boolean(post) && !modalContentReady);
  const showCloseButton = !showLoadingShell;

  return createPortal(
    <div
      className="news-modal-backdrop"
      ref={backdropRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={showLoadingShell ? "Новость загружается" : "Новость"}
      aria-busy={showLoadingShell}
    >
      <div className={`news-modal${showLoadingShell ? " is-loading-content" : " is-content-ready"}`} ref={modalRef}>
        {showCloseButton ? (
          <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
            <X size={20} />
          </button>
        ) : null}
        {state === "loading" ? (
          <div className="news-modal-loading-shell" aria-hidden="true" />
        ) : state === "error" ? (
          <div className="news-modal-loading">{errorMessage ?? "Ошибка."}</div>
        ) : state === "forbidden" || state === "unauthenticated" || !post ? (
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
        {showLoadingShell ? (
          <div className="news-modal-loading-overlay" aria-hidden="true">
            <span className="comment-sr-only">Новость загружается</span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function countExpectedNewsModalImages(post: NewsPostDetail) {
  let count = post.coverImageId ? 1 : 0;

  for (const block of post.blocks ?? []) {
    const payload = block.payload;
    if (block.type === "image" && hasFileId(payload)) {
      count += 1;
    }
    if (block.type === "gallery" && Array.isArray(payload.images)) {
      count += payload.images.filter(hasImageFileId).length;
    }
    if (block.type === "image_checklist" && hasNestedImageFileId(payload)) {
      count += 1;
    }
  }

  return count;
}

function hasFileId(payload: Record<string, unknown>) {
  return typeof payload.fileId === "string" && payload.fileId.length > 0;
}

function hasImageFileId(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "fileId" in value &&
    typeof value.fileId === "string" &&
    value.fileId.length > 0
  );
}

function hasNestedImageFileId(payload: Record<string, unknown>) {
  return hasImageFileId(payload.image);
}

function isBlockingModalImage(image: HTMLImageElement) {
  return image.getAttribute("loading") !== "lazy";
}

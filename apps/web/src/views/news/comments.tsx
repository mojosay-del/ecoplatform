import { useEffect, useLayoutEffect, useMemo, useRef, type FormEvent } from "react";
import { Flag, MessageCircleOff, Send, ThumbsUp } from "lucide-react";
import type { NewsCommentDecorated } from "@ecoplatform/shared";
import { useAuth } from "../../lib/auth";
import { CommentAvatar, formatCommentDate, getCommentAuthor } from "../shared";

const COMMENT_TEXTAREA_MAX_HEIGHT = 168;

type CommentsSectionProps = {
  comments: NewsCommentDecorated[];
  commentText: string;
  onCommentTextChange: (value: string) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
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

export function CommentsSection({
  comments,
  commentText,
  onCommentTextChange,
  onSubmitComment,
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
  const currentUserId = user?.id ?? null;
  const currentUserName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const currentUserAvatarUrl = user?.avatarUrl ?? null;
  const orderedComments = useMemo(() => sortCommentsChronologically(comments), [comments]);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [orderedComments]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, COMMENT_TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMMENT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [commentText]);

  return (
    <section className="comments-section" aria-labelledby="comments-title">
      <div className="comments-section-head">
        <h2 className="comments-kicker" id="comments-title">
          Обсуждение
        </h2>
      </div>

      <div className="comments-chat-surface">
        <div
          aria-label="История комментариев"
          aria-live="polite"
          className="comment-list"
          ref={listRef}
          tabIndex={orderedComments.length > 0 ? 0 : undefined}
        >
          {orderedComments.length === 0 ? (
            <div className="comments-empty">
              <MessageCircleOff aria-hidden="true" size={20} />
              <span>Пока никто не написал комментарий.</span>
            </div>
          ) : (
            orderedComments.map((comment) => (
              <CommentCard
                comment={comment}
                currentUserAvatarUrl={currentUserAvatarUrl}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
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
            <label className="comment-sr-only" htmlFor="news-comment-text">
              Ваш комментарий
            </label>
            <textarea
              aria-describedby="comment-composer-help"
              className="comment-textarea"
              id="news-comment-text"
              name="comment"
              onChange={(event) => onCommentTextChange(event.target.value)}
              placeholder="Сообщение"
              ref={textareaRef}
              rows={1}
              value={commentText}
            />
            <span className="comment-sr-only" id="comment-composer-help">
              Публикуем комментарий сразу после отправки.
            </span>
            <button
              aria-label="Опубликовать комментарий"
              className="button comment-submit"
              disabled={!commentText.trim()}
              type="submit"
            >
              <Send aria-hidden="true" size={17} />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function CommentCard({
  comment,
  isReply = false,
  currentUserAvatarUrl,
  currentUserId,
  currentUserName,
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
  currentUserAvatarUrl: string | null;
  currentUserId: string | null;
  currentUserName: string;
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
  const isSameVisibleUser =
    currentUserName.length > 0 && currentUserName === author && currentUserAvatarUrl === comment.user.avatarUrl;
  const isOwn = currentUserId === comment.user.id || isSameVisibleUser;
  const canUseCommentActions = !isOwn;

  function closeReportForm() {
    setReportingCommentId(null);
    setReportComment("");
  }

  return (
    <article className={`comment-card ${isReply ? "is-reply" : ""} ${isOwn ? "is-own" : ""}`}>
      <CommentAvatar user={comment.user} />
      <div className="comment-bubble">
        <header className="comment-card-head">
          <div className="comment-author-meta">
            <strong>{isOwn ? "Вы" : author}</strong>
            {canUseCommentActions ? (
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
            ) : null}
          </div>
          <div className="comment-message-meta" aria-label={`Действия с комментарием, лайков: ${likesCount}`}>
            {canUseCommentActions ? (
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
            ) : null}
            {commentDate ? (
              <time className="comment-message-time" dateTime={commentDate.toISOString()}>
                {formatCommentDate(commentDate)}
              </time>
            ) : null}
          </div>
        </header>
        <p className="comment-text">{comment.text}</p>

        {canUseCommentActions && isReporting ? (
          <form className="comment-report-form" onSubmit={onSubmitComplaint}>
            <label className="comment-report-label" htmlFor={`comment-report-reason-${comment.id}`}>
              Причина жалобы
            </label>
            <select
              className="select"
              id={`comment-report-reason-${comment.id}`}
              onChange={(event) => setReportReason(event.target.value)}
              value={reportReason}
            >
              {complaintReasons.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="comment-report-label" htmlFor={`comment-report-comment-${comment.id}`}>
              Комментарий модератору
            </label>
            <textarea
              className="textarea small"
              id={`comment-report-comment-${comment.id}`}
              onChange={(event) => setReportComment(event.target.value)}
              placeholder="Можно кратко пояснить проблему"
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
                currentUserAvatarUrl={currentUserAvatarUrl}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
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

function sortCommentsChronologically(comments: NewsCommentDecorated[]): NewsCommentDecorated[] {
  return [...comments].sort(compareCommentsByDate).map((comment) => ({
    ...comment,
    replies: comment.replies?.length ? sortCommentsChronologically(comment.replies) : comment.replies,
  }));
}

function compareCommentsByDate(left: NewsCommentDecorated, right: NewsCommentDecorated) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

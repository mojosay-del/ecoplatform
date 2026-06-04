import type { FormEvent } from "react";
import { Flag, MessageCircleOff, Send, ThumbsUp } from "lucide-react";
import type { NewsCommentDecorated } from "@ecoplatform/shared";
import { StatusPill } from "../../components/StatusPill";
import { useAuth } from "../../lib/auth";
import { CommentAvatar, formatCommentDate, getCommentAuthor } from "../shared";

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

export function CommentsSection({
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

      {resultMessage ? (
        <StatusPill as="p" className="comments-status" variant="success">
          {resultMessage}
        </StatusPill>
      ) : null}

      <form className="comment-composer" onSubmit={onSubmitComment}>
        <CommentAvatar current user={user} />
        <div className="comment-composer-body">
          <label className="comment-textarea-label" htmlFor="news-comment-text">
            Ваш комментарий
          </label>
          <textarea
            aria-describedby="comment-composer-help"
            className="comment-textarea"
            id="news-comment-text"
            name="comment"
            onChange={(event) => onCommentTextChange(event.target.value)}
            placeholder="Напишите, что думаете по теме"
            rows={3}
            value={commentText}
          />
          <div className="comment-composer-footer">
            <span id="comment-composer-help">Публикуем сразу после отправки</span>
            <button className="button comment-submit" disabled={!commentText.trim()} type="submit">
              <Send aria-hidden="true" size={16} />
              Опубликовать
            </button>
          </div>
        </div>
      </form>

      <div className="comment-list">
        {comments.length === 0 ? (
          <div className="comments-empty">
            <MessageCircleOff aria-hidden="true" size={20} />
            <span>Пока никто не написал комментарий.</span>
          </div>
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
            {commentDate ? <time dateTime={commentDate.toISOString()}>{formatCommentDate(commentDate)}</time> : null}
          </div>
        </header>
        <p className="comment-text">{comment.text}</p>
        <footer className="comment-card-footer">
          <div className="comment-card-actions" aria-label={`Действия с комментарием, лайков: ${likesCount}`}>
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

function formatCommentCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} комментарий`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} комментария`;
  return `${count} комментариев`;
}

const complaintReasons = [
  ["contact_data", "Контактные данные"],
  ["false_information", "Недостоверная информация"],
  ["offensive_content", "Оскорбления"],
  ["spam", "Спам"],
  ["illegal_content", "Нарушает закон"],
  ["other", "Иное"],
] as const;

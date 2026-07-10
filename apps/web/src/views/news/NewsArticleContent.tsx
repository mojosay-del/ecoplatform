import Image from "next/image";
import { useRef, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import type { NewsPostDetail } from "@ecoplatform/shared";
import {
  LikeActionIcon,
  type AnimatedNavIconHandle,
  useAnimatedNavIconPlayback,
} from "../../components/app-shell/nav-icons";
import { preferredFileAssetImageUrl } from "../../lib/api";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { ContentBlocks } from "../content-blocks";
import { NewsMetaItem, formatNewsDate } from "../shared";
import { CommentsSection } from "./comments";

type NewsArticleProps = {
  post: NewsPostDetail;
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
  onTogglePostLike: () => void;
  likePending: boolean;
  onToggleCommentLike: (commentId: string) => void;
  commentLikePendingId: string | null;
};

export function NewsArticleContent({
  post,
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
  onTogglePostLike,
  likePending,
  onToggleCommentLike,
  commentLikePendingId,
}: NewsArticleProps) {
  const coverAssets = useFileAssetsByIds(post.coverImageId ? [post.coverImageId] : []);
  const cover = post.coverImageId ? (coverAssets.get(post.coverImageId) ?? null) : null;
  const coverUrl = preferredFileAssetImageUrl(cover);
  const publishedDate = post.firstPublishedAt ? new Date(post.firstPublishedAt) : null;
  const isExtended = post.accessTier === "extended";

  return (
    <div className={`news-article${isExtended ? " is-extended" : ""}`}>
      {coverUrl ? (
        <div className="news-article-cover">
          <Image
            alt={post.title}
            src={coverUrl}
            fill
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="u-object-cover"
            priority
          />
        </div>
      ) : null}
      <div className="news-article-body">
        <div className="news-article-content">
          <span className="news-tile-category">{isExtended ? "Расширенная" : "Новости"}</span>
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
            commentText={commentText}
            onCommentTextChange={onCommentTextChange}
            onSubmitComment={onSubmitComment}
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
    </div>
  );
}

export function NewsLikeButton({
  post,
  pending,
  onToggle,
}: {
  post: Pick<NewsPostDetail, "_count" | "likedByMe">;
  pending: boolean;
  onToggle: () => void;
}) {
  const likesCount = post._count?.likes ?? 0;
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);

  return (
    <button
      className={`news-like-button ${post.likedByMe ? "active" : ""}`}
      disabled={pending}
      onClick={onToggle}
      {...iconPlayback}
      type="button"
      aria-label={post.likedByMe ? `Убрать лайк, сейчас ${likesCount}` : `Поставить лайк, сейчас ${likesCount}`}
      aria-pressed={Boolean(post.likedByMe)}
    >
      <LikeActionIcon ref={iconRef} size={24} />
      <strong>{likesCount}</strong>
    </button>
  );
}

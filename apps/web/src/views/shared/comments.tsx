"use client";

// Хелперы и мелкие компоненты вокруг новостей и комментариев — то, что нужно
// и ленте (NewsView), и странице поста, и карточкам. Раньше лежало в общем
// _shared.tsx; вынесено в отдельный модуль для наглядности.

import Image from "next/image";
import { UserRound, type LucideIcon } from "lucide-react";

export type LikeResult = {
  liked: boolean;
  likesCount: number;
};

export function formatNewsDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatCommentDate(value: string | Date) {
  const date = new Date(value);
  const datePart = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  const timePart = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

export function getCommentAuthor(user: { firstName?: string; lastName?: string } | null | undefined) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || "Участник";
}

export function CommentAvatar({
  user,
  current = false,
}: {
  user: { avatarUrl?: string | null; firstName?: string; lastName?: string } | null | undefined;
  current?: boolean;
}) {
  return (
    <div
      className={`comment-avatar ${current ? "is-current" : ""} ${user?.avatarUrl ? "has-image" : ""}`}
      aria-hidden="true"
    >
      {user?.avatarUrl ? (
        <Image alt="" src={user.avatarUrl} width={42} height={42} />
      ) : current ? (
        "Вы"
      ) : (
        <UserRound size={22} aria-hidden="true" />
      )}
    </div>
  );
}

// Каждое из этих обновлений возвращает новую структуру вместо мутации —
// State-обновления React требуют новой ссылки.
export function withUpdatedNewsLike<T extends { _count?: Record<string, unknown> }>(post: T, result: LikeResult): T {
  return {
    ...post,
    likedByMe: result.liked,
    _count: {
      ...(post._count ?? {}),
      likes: result.likesCount,
    },
  } as T;
}

type CommentLikeNode = {
  id: string;
  likedByMe?: boolean;
  _count?: Record<string, unknown>;
  replies?: CommentLikeNode[];
};

function updateCommentLikeInList<T extends CommentLikeNode>(comments: T[], commentId: string, result: LikeResult): T[] {
  return comments.map((comment) => {
    const next: T =
      comment.id === commentId
        ? ({
            ...comment,
            likedByMe: result.liked,
            _count: {
              ...(comment._count ?? {}),
              likes: result.likesCount,
            },
          } as T)
        : comment;

    if (!next.replies?.length) {
      return next;
    }

    return {
      ...next,
      replies: updateCommentLikeInList(next.replies, commentId, result),
    } as T;
  });
}

export function withUpdatedCommentLike<P extends { comments?: CommentLikeNode[] }>(
  post: P,
  commentId: string,
  result: LikeResult,
): P {
  return {
    ...post,
    comments: updateCommentLikeInList(post.comments ?? [], commentId, result),
  } as P;
}

export function NewsMetaItem({ count, icon: Icon, label }: { count: number; icon: LucideIcon; label: string }) {
  return (
    <span className="news-meta-item" aria-label={`${label}: ${count}`}>
      <Icon aria-hidden="true" size={14} strokeWidth={2} />
      <span>{count}</span>
    </span>
  );
}

// Возвращает только поля, которые могут поменяться при лайке/комменте:
// после обновления одной новости в ленте перезатираем именно их. Generic
// сохраняет точный тип `_count`, чтобы вернувшийся объект можно было
// «накатить» на NewsListItem без потери типа.
export function getNewsFeedSnapshot<C, L extends boolean>(post: { _count: C; likedByMe: L }) {
  return {
    _count: post._count,
    likedByMe: post.likedByMe,
  };
}

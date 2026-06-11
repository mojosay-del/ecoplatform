import { CommentStatus, DiscussionTargetType, FileAccessLevel, Prisma } from "@prisma/client";
import { publicUrl } from "../../files/files-storage.helpers";
import type { PrismaService } from "../../prisma/prisma.service";

export const newsCommentAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarFile: { select: { storageKey: true, accessLevel: true } },
} satisfies Prisma.UserSelect;

type NewsCommentAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  avatarFile: { storageKey: string; accessLevel: FileAccessLevel } | null;
};

type NewsCommentPayload = {
  user: NewsCommentAuthor;
  likes?: Array<{ id: string }>;
  replies?: NewsCommentPayload[];
  [key: string]: unknown;
};

function decorateCommentAuthor(user: NewsCommentAuthor) {
  const { avatarFile, ...publicUser } = user;
  return {
    ...publicUser,
    // Аватар — загруженное автором фото (или null → нейтральная иконка на фронте).
    // Пол больше не раскрывается и не участвует в выборе аватара (приватность, A2).
    avatarUrl: avatarFile ? publicUrl(avatarFile.storageKey, avatarFile.accessLevel) : null,
  };
}

export function decorateNewsComment(comment: NewsCommentPayload): Record<string, unknown> {
  const { likes = [], replies, ...publicComment } = comment;
  return {
    ...publicComment,
    likedByMe: likes.length > 0,
    user: decorateCommentAuthor(comment.user),
    replies: replies?.map((reply) => decorateNewsComment(reply)),
  };
}

export async function loadPublishedNewsCommentCounts(
  prisma: PrismaService,
  newsPostIds: string[],
): Promise<Map<string, number>> {
  return loadNewsCommentCounts(prisma, newsPostIds, { onlyPublished: true });
}

export async function loadAllNewsCommentCounts(
  prisma: PrismaService,
  newsPostIds: string[],
): Promise<Map<string, number>> {
  return loadNewsCommentCounts(prisma, newsPostIds, { onlyPublished: false });
}

async function loadNewsCommentCounts(
  prisma: PrismaService,
  newsPostIds: string[],
  options: { onlyPublished: boolean },
): Promise<Map<string, number>> {
  if (newsPostIds.length === 0) return new Map();

  const discussions = await prisma.discussion.findMany({
    where: { targetType: DiscussionTargetType.news_post, targetId: { in: newsPostIds } },
    select: { id: true, targetId: true },
  });
  if (discussions.length === 0) return new Map();

  const counts = await prisma.comment.groupBy({
    by: ["discussionId"],
    where: {
      discussionId: { in: discussions.map((discussion) => discussion.id) },
      ...(options.onlyPublished ? { status: CommentStatus.published } : {}),
    },
    _count: { _all: true },
  });
  const countByDiscussion = new Map(counts.map((row) => [row.discussionId, row._count._all]));
  return new Map(discussions.map((discussion) => [discussion.targetId, countByDiscussion.get(discussion.id) ?? 0]));
}

import { CommentStatus, DiscussionTargetType, Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

export const newsCommentAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  company: { select: { type: true } },
  platformStaff: { select: { roles: true, isActive: true } },
} satisfies Prisma.UserSelect;

type NewsCommentAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  company: { type: string } | null;
  platformStaff: { roles: string[]; isActive: boolean } | null;
};

type NewsCommentPayload = {
  user: NewsCommentAuthor;
  likes?: Array<{ id: string }>;
  replies?: NewsCommentPayload[];
  [key: string]: unknown;
};

const companyAvatarPrefixByType: Record<string, string> = {
  collector: "z",
  trader: "t",
  processor: "p",
};

const avatarSuffixByGender: Record<string, string> = {
  male: "man",
  female: "woman",
};

function resolveProfileAvatarUrl(platformRoles: string[], companyType: string | null, gender: string): string | null {
  const platformPrefix = platformRoles.includes("admin")
    ? "a"
    : platformRoles.includes("moderator") || platformRoles.includes("content_manager")
      ? "m"
      : null;
  const suffix = avatarSuffixByGender[gender];
  if (platformPrefix && suffix) {
    return `/avatars/platform/${platformPrefix}${suffix}.png`;
  }
  const companyPrefix = companyType ? companyAvatarPrefixByType[companyType] : null;
  if (!companyPrefix || !suffix) return null;
  return `/avatars/company/${companyPrefix}${suffix}.png`;
}

function decorateCommentAuthor(user: NewsCommentAuthor) {
  const { company, platformStaff, ...publicUser } = user;
  const platformRoles = platformStaff?.isActive ? platformStaff.roles : [];
  return {
    ...publicUser,
    avatarUrl: resolveProfileAvatarUrl(platformRoles, company?.type ?? null, user.gender),
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

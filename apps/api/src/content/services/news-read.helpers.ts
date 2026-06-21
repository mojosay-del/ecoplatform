import { NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, DiscussionTargetType, Prisma } from "@prisma/client";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContentCommonService } from "./content-common.service";
import {
  decorateNewsComment,
  loadAllNewsCommentCounts,
  loadPublishedNewsCommentCounts,
  newsCommentAuthorSelect,
} from "./news-comment.helpers";
import { normaliseTagFilters } from "./news-tag.helpers";
import { sanitizeContentBlocksForResponse } from "./content-block-response.helpers";

export type NewsReadOptions = { preview?: boolean };

type NewsReadDeps = {
  prisma: PrismaService;
  common: ContentCommonService;
};

type AudioAttachment = {
  fileId: string;
  episodeTitle: string | null;
  caption: string | null;
  durationSeconds: number | null;
};

export async function listPublishedNews(
  { prisma, common }: NewsReadDeps,
  user: RequestUser,
  paginationInput: PaginationInput & { q?: string; tags?: string[] } = {},
) {
  common.assertFunctionalAccess(user);

  const pagination = resolvePagination(paginationInput, { defaultLimit: 20, maxLimit: 100 });
  const tagFilters = normaliseTagFilters(paginationInput.tags);
  const search = paginationInput.q?.trim();
  const andFilters: Prisma.NewsPostWhereInput[] = tagFilters.map((name) => ({
    tags: { some: { newsTag: { name } } },
  }));

  if (search) {
    andFilters.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { lead: { contains: search, mode: "insensitive" } },
        { tags: { some: { newsTag: { name: { contains: search, mode: "insensitive" } } } } },
      ],
    });
  }

  const where: Prisma.NewsPostWhereInput = {
    status: ContentStatus.published,
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };

  const [total, posts] = await prisma.$transaction([
    prisma.newsPost.count({ where }),
    prisma.newsPost.findMany({
      where,
      orderBy: { firstPublishedAt: "desc" },
      take: pagination.limit,
      skip: pagination.offset,
      include: {
        tags: { include: { newsTag: true } },
        blocks: {
          where: { type: "audio" },
          orderBy: { position: "asc" },
          take: 1,
          select: { payload: true },
        },
        likes: { where: { userId: user.id }, select: { id: true } },
        _count: { select: { likes: true } },
      },
    }),
  ]);

  // Комментарии теперь живут в Discussion(targetType=news_post, targetId=NewsPost.id).
  // Считаем их батчем для всех новостей страницы — иначе на каждую карточку
  // отдельный запрос.
  const commentCounts = await loadPublishedNewsCommentCounts(
    prisma,
    posts.map((post) => post.id),
  );

  const items = posts.map(({ blocks, likes, _count, ...post }) => ({
    ...post,
    audioAttachment: toNewsAudioAttachment(blocks),
    _count: { likes: _count.likes, comments: commentCounts.get(post.id) ?? 0 },
    likedByMe: likes.length > 0,
  }));
  return paginatedResponse(items, total, pagination);
}

export async function listPublishedNewsTags(
  { prisma, common }: NewsReadDeps,
  user: RequestUser,
  options: { limit?: number } = {},
) {
  common.assertFunctionalAccess(user);
  const limit = resolvePagination({ limit: options.limit }, { defaultLimit: 20, maxLimit: 100 }).limit;

  return prisma.newsTag.findMany({
    where: {
      posts: {
        some: {
          newsPost: { status: ContentStatus.published },
        },
      },
    },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    take: limit,
    select: { id: true, name: true, slug: true, usageCount: true },
  });
}

export async function getPublishedNews(
  { prisma, common }: NewsReadDeps,
  slug: string,
  user: RequestUser,
  options: NewsReadOptions = {},
) {
  common.assertFunctionalAccess(user);

  const post = await prisma.newsPost.findUnique({
    where: { slug },
    include: {
      blocks: { orderBy: { position: "asc" } },
      tags: { include: { newsTag: true } },
      likes: { where: { userId: user.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });

  if (!post) {
    throw new NotFoundException("Новость не найдена.");
  }
  const canPreview = options.preview && canPreviewAuthoredContent(user, post.createdById);
  if (post.status !== ContentStatus.published && !canPreview) {
    throw new NotFoundException("Новость не найдена.");
  }

  // Комментарии берём через Discussion. Если её ещё нет (никто не комментировал),
  // отдаём пустой массив и 0 в счётчике — Discussion создастся лениво при первом
  // POST /comments.
  const discussionWhere = {
    discussion: { targetType: DiscussionTargetType.news_post, targetId: post.id },
  } satisfies Prisma.CommentWhereInput;

  const [comments, commentsCount] = await Promise.all([
    prisma.comment.findMany({
      where: { ...discussionWhere, parentCommentId: null, status: CommentStatus.published },
      orderBy: { createdAt: "desc" },
      include: {
        replies: {
          where: { status: CommentStatus.published },
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: newsCommentAuthorSelect },
            likes: { where: { userId: user.id }, select: { id: true } },
            _count: { select: { likes: true } },
          },
        },
        user: { select: newsCommentAuthorSelect },
        likes: { where: { userId: user.id }, select: { id: true } },
        _count: { select: { likes: true } },
      },
    }),
    prisma.comment.count({ where: { ...discussionWhere, status: CommentStatus.published } }),
  ]);

  const { likes, _count, ...payload } = post;
  return {
    ...payload,
    blocks: sanitizeContentBlocksForResponse(post.blocks),
    audioAttachment: toNewsAudioAttachment(post.blocks),
    _count: { likes: _count.likes, comments: commentsCount },
    comments: comments.map((comment) => decorateNewsComment(comment)),
    likedByMe: likes.length > 0,
  };
}

export async function listAdminNews(
  { prisma }: NewsReadDeps,
  pagination: { limit?: number; offset?: number; q?: string } = {},
) {
  const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
  const offset = Math.max(pagination.offset ?? 0, 0);
  const titleQuery = pagination.q?.trim();
  const where: Prisma.NewsPostWhereInput = titleQuery ? { title: { contains: titleQuery, mode: "insensitive" } } : {};

  const [total, postsRaw] = await prisma.$transaction([
    prisma.newsPost.count({ where }),
    prisma.newsPost.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        tags: { include: { newsTag: true } },
        _count: { select: { blocks: true, likes: true } },
      },
    }),
  ]);

  // Комментарии — через Discussion (см. listPublishedNews). В админ-таблице считаем
  // ВСЕ комментарии без фильтра по статусу: модератор должен видеть, что
  // у новости есть скрытые/удалённые комментарии в очереди модерации.
  const commentCounts = await loadAllNewsCommentCounts(
    prisma,
    postsRaw.map((post) => post.id),
  );

  const items = postsRaw.map(({ _count, ...post }) => ({
    ...post,
    _count: { blocks: _count.blocks, likes: _count.likes, comments: commentCounts.get(post.id) ?? 0 },
  }));

  return {
    items,
    total,
    hasMore: offset + items.length < total,
  };
}

export async function listAdminNewsTags({ prisma }: NewsReadDeps) {
  return prisma.newsTag.findMany({
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    select: { id: true, name: true, usageCount: true },
  });
}

export async function getAdminNewsPost({ prisma }: NewsReadDeps, id: string) {
  const post = await prisma.newsPost.findUnique({
    where: { id },
    include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
  });
  if (!post) {
    throw new NotFoundException("Новость не найдена.");
  }
  return { ...post, blocks: sanitizeContentBlocksForResponse(post.blocks) };
}

function canPreviewAuthoredContent(user: RequestUser, createdById: string) {
  return (
    user.id === createdById || user.platformRoles.includes("admin") || user.platformRoles.includes("content_manager")
  );
}

function toNewsAudioAttachment(blocks: Array<{ payload: Prisma.JsonValue }>): AudioAttachment | null {
  for (const block of blocks) {
    const payload = block.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const fileId = payload.fileId;
    if (typeof fileId !== "string" || !fileId) continue;
    const episodeTitle = typeof payload.episodeTitle === "string" && payload.episodeTitle ? payload.episodeTitle : null;
    const caption = typeof payload.caption === "string" && payload.caption ? payload.caption : null;
    const durationSeconds =
      typeof payload.durationSeconds === "number" && Number.isFinite(payload.durationSeconds)
        ? payload.durationSeconds
        : null;
    return { fileId, episodeTitle, caption, durationSeconds };
  }
  return null;
}

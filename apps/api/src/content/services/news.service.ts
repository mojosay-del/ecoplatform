import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, DiscussionTargetType, Prisma } from "@prisma/client";
import { PlatformSettingsService } from "../../admin/settings/platform-settings.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type { newsInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import {
  decorateNewsComment,
  loadAllNewsCommentCounts,
  loadPublishedNewsCommentCounts,
  newsCommentAuthorSelect,
} from "./news-comment.helpers";
import {
  createNewsPost,
  deleteNewsPost,
  publishNewsPost,
  unpublishNewsPost,
  updateNewsPost,
} from "./news-admin-workflow.helpers";
import { normaliseTagFilters } from "./news-tag.helpers";

type NewsInput = z.infer<typeof newsInputSchema>;
type NewsReadOptions = { preview?: boolean };
type AudioAttachment = {
  fileId: string;
  episodeTitle: string | null;
  caption: string | null;
  durationSeconds: number | null;
};

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

// Раздел «Новости»: чтение, CRUD, теги, лайки, комментарии. Вынесен из
// 2120-строчного ContentService — теперь автономный сервис, который инжектит
// ContentCommonService для shared-хелперов (assertFunctionalAccess, payload,
// cleanupDetachedFiles и т.п.).
@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly common: ContentCommonService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async listNews(user: RequestUser, paginationInput: PaginationInput & { tags?: string[] } = {}) {
    this.common.assertFunctionalAccess(user);

    const pagination = resolvePagination(paginationInput, { defaultLimit: 20, maxLimit: 100 });
    const tagFilters = normaliseTagFilters(paginationInput.tags);

    const where: Prisma.NewsPostWhereInput = {
      status: ContentStatus.published,
      ...(tagFilters.length > 0
        ? {
            AND: tagFilters.map((name) => ({
              tags: { some: { newsTag: { name } } },
            })),
          }
        : {}),
    };

    const [total, posts] = await this.prisma.$transaction([
      this.prisma.newsPost.count({ where }),
      this.prisma.newsPost.findMany({
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
      this.prisma,
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

  async listNewsTags(user: RequestUser, options: { limit?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const limit = resolvePagination({ limit: options.limit }, { defaultLimit: 20, maxLimit: 100 }).limit;

    return this.prisma.newsTag.findMany({
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

  async getNews(slug: string, user: RequestUser, options: NewsReadOptions = {}) {
    this.common.assertFunctionalAccess(user);

    const post = await this.prisma.newsPost.findUnique({
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
      this.prisma.comment.findMany({
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
      this.prisma.comment.count({ where: { ...discussionWhere, status: CommentStatus.published } }),
    ]);

    const { likes, _count, ...payload } = post;
    return {
      ...payload,
      audioAttachment: toNewsAudioAttachment(post.blocks),
      _count: { likes: _count.likes, comments: commentsCount },
      comments: comments.map((comment) => decorateNewsComment(comment)),
      likedByMe: likes.length > 0,
    };
  }

  async createNews(input: NewsInput, user: RequestUser) {
    return createNewsPost(this.workflowDeps(), input, user);
  }

  async updateNews(id: string, input: NewsInput, user: RequestUser) {
    return updateNewsPost(this.workflowDeps(), id, input, user);
  }

  async publishNews(id: string, user: RequestUser) {
    return publishNewsPost(this.workflowDeps(), id, user);
  }

  async unpublishNews(id: string, user: RequestUser, reason?: string) {
    return unpublishNewsPost(this.workflowDeps(), id, user, reason);
  }

  async deleteNews(id: string, user: RequestUser, reason?: string) {
    return deleteNewsPost(this.workflowDeps(), id, user, reason);
  }

  // Списочный эндпоинт для админки: пагинация + БЕЗ `blocks`. Раньше
  // листинг тянул весь контент новостей (~400КБ JSON на 100 новостях),
  // хотя для таблицы нужны только заголовок/lead/обложка/статус/_count.
  // При клике на «Редактировать» фронт отдельно дёргает `getAdminNews(id)`.
  async adminListNews(pagination: { limit?: number; offset?: number; q?: string } = {}) {
    const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
    const offset = Math.max(pagination.offset ?? 0, 0);
    const titleQuery = pagination.q?.trim();
    const where: Prisma.NewsPostWhereInput = titleQuery ? { title: { contains: titleQuery, mode: "insensitive" } } : {};

    const [total, postsRaw] = await this.prisma.$transaction([
      this.prisma.newsPost.count({ where }),
      this.prisma.newsPost.findMany({
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

    // Комментарии — через Discussion (см. listNews). В админ-таблице считаем
    // ВСЕ комментарии без фильтра по статусу: модератор должен видеть, что
    // у новости есть скрытые/удалённые комментарии в очереди модерации.
    const commentCounts = await loadAllNewsCommentCounts(
      this.prisma,
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

  async adminListNewsTags() {
    return this.prisma.newsTag.findMany({
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      select: { id: true, name: true, usageCount: true },
    });
  }

  // Раньше был приватным — теперь нужен публично, чтобы AdminNewsView мог
  // подгружать blocks только при открытии редактора (а не для всех строк таблицы).
  async getAdminNews(id: string) {
    const post = await this.prisma.newsPost.findUnique({
      where: { id },
      include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
    });
    if (!post) {
      throw new NotFoundException("Новость не найдена.");
    }
    return post;
  }

  async toggleNewsLike(id: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const post = await this.prisma.newsPost.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!post || post.status !== ContentStatus.published) {
      throw new NotFoundException("Новость не найдена.");
    }

    const existing = await this.prisma.newsLike.findUnique({
      where: { userId_newsPostId: { userId: user.id, newsPostId: id } },
    });
    let liked = false;

    if (existing) {
      await this.prisma.newsLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.newsLike.create({ data: { userId: user.id, newsPostId: id } });
      liked = true;
    }

    const likesCount = await this.prisma.newsLike.count({ where: { newsPostId: id } });
    return { liked, likesCount };
  }

  async toggleNewsCommentLike(id: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    await this.moduleAccess.assertModuleAccess(user.id, "comments");

    const comment = await this.prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        discussion: { select: { targetType: true, targetId: true } },
      },
    });
    if (!comment || comment.status !== CommentStatus.published) {
      throw new NotFoundException("Комментарий не найден.");
    }
    if (comment.discussion.targetType !== DiscussionTargetType.news_post) {
      // На уроки/КБ/листинги/форум комментарии в MVP отображения нет;
      // защищаемся на уровне сервиса, чтобы не лайкнуть «невидимый» коммент.
      throw new NotFoundException("Комментарий не найден.");
    }
    const newsPost = await this.prisma.newsPost.findUnique({
      where: { id: comment.discussion.targetId },
      select: { status: true },
    });
    if (!newsPost || newsPost.status !== ContentStatus.published) {
      throw new NotFoundException("Комментарий не найден.");
    }
    if (comment.userId === user.id) {
      throw new ForbiddenException("Нельзя поставить лайк своему комментарию.");
    }

    const existing = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId: user.id, commentId: id } },
    });
    let liked = false;

    if (existing) {
      await this.prisma.commentLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.commentLike.create({ data: { userId: user.id, commentId: id } });
      liked = true;
    }

    const likesCount = await this.prisma.commentLike.count({ where: { commentId: id } });
    return { liked, likesCount };
  }

  async addNewsComment(newsPostId: string, user: RequestUser, input: { text: string; parentCommentId?: string }) {
    // Глобальный стоп-кран комментариев из админки (Настройки → Сообщество).
    // Проверяем до доступа пользователя, чтобы при отключении любой запрос
    // получал понятный отказ.
    const commentsEnabled = await this.settings.getValue("discussions.enabled");
    if (!commentsEnabled) {
      throw new ForbiddenException("Комментирование временно отключено.");
    }
    this.common.assertFunctionalAccess(user);
    await this.moduleAccess.assertModuleAccess(user.id, "comments");

    const post = await this.prisma.newsPost.findUnique({
      where: { id: newsPostId },
      select: { id: true, status: true },
    });
    if (!post || post.status !== ContentStatus.published) {
      throw new NotFoundException("Новость не найдена.");
    }

    let parentCommentId = input.parentCommentId;

    if (parentCommentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentCommentId },
        select: {
          id: true,
          parentCommentId: true,
          status: true,
          discussion: { select: { targetType: true, targetId: true } },
        },
      });
      if (
        !parent ||
        parent.status !== CommentStatus.published ||
        parent.discussion.targetType !== DiscussionTargetType.news_post ||
        parent.discussion.targetId !== newsPostId
      ) {
        throw new NotFoundException("Комментарий не найден.");
      }
      parentCommentId = parent.parentCommentId ?? parent.id;
    }

    // Discussion для этой новости создаём лениво при первом комментарии.
    // upsert — атомарно, чтобы два параллельных POST не нарвались на
    // unique(targetType, targetId).
    const discussion = await this.prisma.discussion.upsert({
      where: {
        targetType_targetId: {
          targetType: DiscussionTargetType.news_post,
          targetId: newsPostId,
        },
      },
      create: {
        targetType: DiscussionTargetType.news_post,
        targetId: newsPostId,
      },
      update: {},
    });

    return this.prisma.comment.create({
      data: {
        discussionId: discussion.id,
        userId: user.id,
        text: input.text,
        parentCommentId,
      },
    });
  }

  private workflowDeps() {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      common: this.common,
    };
  }
}

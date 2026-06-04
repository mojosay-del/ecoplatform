import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, DiscussionTargetType, Prisma } from "@prisma/client";
import { newsBlockSchema, slugify, validateContentBlocks } from "@ecoplatform/shared";
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

type NewsInput = z.infer<typeof newsInputSchema>;
type NewsReadOptions = { preview?: boolean };

function normaliseTagFilters(tagNames: string[] = []): string[] {
  return Array.from(new Set(tagNames.map((name) => name.trim()).filter(Boolean)));
}

function canPreviewAuthoredContent(user: RequestUser, createdById: string) {
  return (
    user.id === createdById || user.platformRoles.includes("admin") || user.platformRoles.includes("content_manager")
  );
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

    const items = posts.map(({ likes, _count, ...post }) => ({
      ...post,
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
      _count: { likes: _count.likes, comments: commentsCount },
      comments: comments.map((comment) => decorateNewsComment(comment)),
      likedByMe: likes.length > 0,
    };
  }

  async createNews(input: NewsInput, user: RequestUser) {
    const check = validateContentBlocks(input.blocks, newsBlockSchema);
    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    await this.common.assertCoverImageAllowed(input.coverImageId, user);

    const slug =
      input.slug ??
      (await this.common.uniqueSlug(input.title, async (candidate) =>
        Boolean(await this.prisma.newsPost.findUnique({ where: { slug: candidate } })),
      ));

    const post = await this.prisma.newsPost.create({
      data: {
        title: input.title,
        lead: input.lead,
        coverImageId: input.coverImageId,
        slug,
        createdById: user.id,
        blocks: {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
          })),
        },
      },
    });

    await this.replaceNewsTags(post.id, input.tags, user.id);

    // Регистрируем «новость → fileIds» в FileReference, чтобы
    // deleteIfUnreferenced работал O(1) вместо сканирования всех блоков.
    await this.common.recordEntityReferences("news_post", post.id, [
      input.coverImageId,
      ...input.blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "news.create",
      entityType: "NewsPost",
      entityId: post.id,
    });

    return this.adminGetNews(post.id);
  }

  async updateNews(id: string, input: NewsInput, user: RequestUser) {
    const check = validateContentBlocks(input.blocks, newsBlockSchema);
    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    await this.common.assertCoverImageAllowed(input.coverImageId, user);

    const before = await this.prisma.newsPost.findUnique({
      where: { id },
      include: { tags: true, blocks: true },
    });
    if (!before) {
      throw new NotFoundException("Новость не найдена.");
    }
    const previousTagIds = before.tags.map((tag) => tag.newsTagId);
    const previousFileIds = this.common.compactFileIds([
      before.coverImageId,
      ...this.common.collectFileIdsFromBlocks(before.blocks),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.newsContentBlock.deleteMany({ where: { newsPostId: id } });
      await tx.newsPost.update({
        where: { id },
        data: {
          title: input.title,
          lead: input.lead,
          coverImageId: input.coverImageId,
          blocks: {
            create: input.blocks.map((block, position) => ({
              position,
              type: block.type,
              payload: this.common.payload(block),
            })),
          },
        },
      });
      await tx.newsPostTag.deleteMany({ where: { newsPostId: id } });
    });

    await this.replaceNewsTags(id, input.tags, user.id);
    await this.refreshTagUsage(previousTagIds);

    // Сначала обновляем FileReference для этой новости (новый набор файлов),
    // потом cleanupDetachedFiles — он увидит, что старый fileId больше никем
    // не упомянут, и удалит из S3.
    await this.common.recordEntityReferences("news_post", id, [
      input.coverImageId,
      ...input.blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);
    await this.common.cleanupDetachedFiles(previousFileIds);

    await this.auditLog.record({
      actorId: user.id,
      action: "news.update",
      entityType: "NewsPost",
      entityId: id,
    });

    return this.adminGetNews(id);
  }

  async publishNews(id: string, user: RequestUser) {
    const existing = await this.prisma.newsPost.findUnique({
      where: { id },
      include: { _count: { select: { blocks: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Новость не найдена.");
    }
    if (existing._count.blocks === 0) {
      throw new ForbiddenException("Нельзя опубликовать новость без блоков.");
    }

    const updated = await this.prisma.newsPost.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "news.publish",
      entityType: "NewsPost",
      entityId: id,
    });

    return updated;
  }

  async unpublishNews(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.newsPost.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Новость не найдена.");
    }

    const updated = await this.prisma.newsPost.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "news.unpublish",
      entityType: "NewsPost",
      entityId: id,
      comment: reason,
    });

    return updated;
  }

  async deleteNews(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.newsPost.findUnique({
      where: { id },
      include: {
        tags: true,
        blocks: true,
      },
    });
    if (!existing) {
      throw new NotFoundException("Новость не найдена.");
    }

    // Файлы комментариев берём через Discussion — у Comment больше нет прямой
    // ссылки на NewsPost.
    const commentAttachments = await this.prisma.commentAttachment.findMany({
      where: { comment: { discussion: { targetType: DiscussionTargetType.news_post, targetId: id } } },
      select: { fileId: true },
    });

    const affectedTagIds = existing.tags.map((tag) => tag.newsTagId);
    const deletedFileIds = this.common.compactFileIds([
      existing.coverImageId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
      ...commentAttachments.map((attachment) => attachment.fileId),
    ]);

    // Discussion(targetType=news_post, targetId=id) удаляем явно ДО NewsPost.delete,
    // потому что прямого FK NewsPost ↔ Comment больше нет. Каскад Discussion → Comment
    // → CommentLike/CommentAttachment продолжает работать через onDelete: Cascade.
    await this.prisma.discussion.deleteMany({
      where: { targetType: DiscussionTargetType.news_post, targetId: id },
    });
    await this.prisma.newsPost.delete({ where: { id } });

    await this.refreshTagUsage(affectedTagIds);
    // FileReference для этой новости очищаем ДО cleanupDetachedFiles, иначе
    // ссылки бы блокировали удаление файла.
    await this.common.clearEntityReferences("news_post", id);
    await this.common.cleanupDetachedFiles(deletedFileIds);

    await this.auditLog.record({
      actorId: user.id,
      action: "news.delete",
      entityType: "NewsPost",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, slug: existing.slug },
    });

    return { ok: true };
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

  private async adminGetNews(id: string) {
    return this.prisma.newsPost.findUnique({
      where: { id },
      include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
    });
  }

  // Раньше тут был N+1: для каждого тега upsert + create — 20 запросов на
  // 10 тегов. Теперь — 3 запроса вне зависимости от длины списка:
  //   1) createMany skipDuplicates — добавляем недостающие теги одним пакетом;
  //   2) findMany по name — берём все id (включая уже существующие);
  //   3) createMany skipDuplicates — связываем NewsPost с тегами.
  private async replaceNewsTags(newsPostId: string, tagNames: string[], actorId: string) {
    const uniqueNames = Array.from(new Set(tagNames.map((name) => name.trim()).filter(Boolean)));
    if (uniqueNames.length === 0) {
      return;
    }

    await this.prisma.newsTag.createMany({
      data: uniqueNames.map((name) => ({
        name,
        slug: slugify(name),
        createdById: actorId,
      })),
      skipDuplicates: true,
    });

    const tags = await this.prisma.newsTag.findMany({
      where: { name: { in: uniqueNames } },
      select: { id: true },
    });

    await this.prisma.newsPostTag.createMany({
      data: tags.map((tag) => ({ newsPostId, newsTagId: tag.id })),
      skipDuplicates: true,
    });

    await this.refreshTagUsage(tags.map((tag) => tag.id));
  }

  private async refreshTagUsage(tagIds: string[]) {
    const unique = Array.from(new Set(tagIds));
    if (unique.length === 0) {
      return;
    }

    const counts = await this.prisma.newsPostTag.groupBy({
      by: ["newsTagId"],
      where: { newsTagId: { in: unique } },
      _count: { newsTagId: true },
    });
    const countMap = new Map(counts.map((row) => [row.newsTagId, row._count.newsTagId]));

    await Promise.all(
      unique.map((tagId) =>
        this.prisma.newsTag.update({
          where: { id: tagId },
          data: { usageCount: countMap.get(tagId) ?? 0 },
        }),
      ),
    );
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
}

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, Prisma } from "@prisma/client";
import { newsBlockSchema, slugify, validateContentBlocks } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { ModuleAccessService } from "../../common/module-access.service";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type { newsInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";

type NewsInput = z.infer<typeof newsInputSchema>;

const commentAuthorSelect = {
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

// Маппинги для генерации public URL аватара. Лежат рядом, потому что нужны
// только декоратору комментариев новостей.
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
  ) {}

  async listNews(user: RequestUser, pagination: { limit?: number; offset?: number } = {}) {
    this.common.assertFunctionalAccess(user);

    // Лимит ограничен сверху, чтобы клиент случайно не выкачал всю таблицу
    // одним запросом. Дефолт 20 — комфортный размер для первого экрана ленты.
    const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
    const offset = Math.max(pagination.offset ?? 0, 0);

    const where = { status: ContentStatus.published };

    const [total, posts] = await this.prisma.$transaction([
      this.prisma.newsPost.count({ where }),
      this.prisma.newsPost.findMany({
        where,
        orderBy: { firstPublishedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          tags: { include: { newsTag: true } },
          likes: { where: { userId: user.id }, select: { id: true } },
          _count: { select: { likes: true, comments: { where: { status: CommentStatus.published } } } },
        },
      }),
    ]);

    const items = posts.map(({ likes, ...post }) => ({ ...post, likedByMe: likes.length > 0 }));
    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  async getNews(slug: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);

    const post = await this.prisma.newsPost.findUnique({
      where: { slug },
      include: {
        blocks: { orderBy: { position: "asc" } },
        tags: { include: { newsTag: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
        comments: {
          where: { parentCommentId: null, status: CommentStatus.published },
          orderBy: { createdAt: "desc" },
          include: {
            replies: {
              where: { status: CommentStatus.published },
              orderBy: { createdAt: "asc" },
              include: {
                user: { select: commentAuthorSelect },
                likes: { where: { userId: user.id }, select: { id: true } },
                _count: { select: { likes: true } },
              },
            },
            user: { select: commentAuthorSelect },
            likes: { where: { userId: user.id }, select: { id: true } },
            _count: { select: { likes: true } },
          },
        },
        _count: { select: { likes: true, comments: { where: { status: CommentStatus.published } } } },
      },
    });

    if (!post || post.status !== ContentStatus.published) {
      throw new NotFoundException("Новость не найдена.");
    }

    const { likes, ...payload } = post;
    return {
      ...payload,
      comments: payload.comments.map((comment) => this.decorateNewsComment(comment)),
      likedByMe: likes.length > 0,
    };
  }

  private decorateNewsComment(comment: NewsCommentPayload): Record<string, unknown> {
    const { likes = [], replies, ...publicComment } = comment;
    return {
      ...publicComment,
      likedByMe: likes.length > 0,
      user: this.decorateCommentAuthor(comment.user),
      replies: replies?.map((reply) => this.decorateNewsComment(reply)),
    };
  }

  private decorateCommentAuthor(user: NewsCommentAuthor) {
    const { company, platformStaff, ...publicUser } = user;
    const platformRoles = platformStaff?.isActive ? platformStaff.roles : [];
    return {
      ...publicUser,
      avatarUrl: resolveProfileAvatarUrl(platformRoles, company?.type ?? null, user.gender),
    };
  }

  async createNews(input: NewsInput, user: RequestUser) {
    const check = validateContentBlocks(input.blocks, newsBlockSchema);
    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

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
        comments: { include: { attachments: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException("Новость не найдена.");
    }

    const affectedTagIds = existing.tags.map((tag) => tag.newsTagId);
    const deletedFileIds = this.common.compactFileIds([
      existing.coverImageId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
      ...existing.comments.flatMap((comment) => comment.attachments.map((attachment) => attachment.fileId)),
    ]);

    // Комментарии физически удаляются каскадом Comment.newsPost (onDelete: Cascade
    // в schema.prisma). Раньше пытались помечать статусом removed_with_news перед
    // delete — но статус не сохранялся, потому что строки сносились микросекундой
    // позже. Аудит-лог делает запись со slug и title удалённой новости.
    await this.prisma.newsPost.delete({ where: { id } });

    await this.refreshTagUsage(affectedTagIds);
    // FileReference для этой новости очищаем ДО cleanupDetachedFiles, иначе
    // ссылки бы блокировали удаление файла. Аналогично для comments — но
    // комментарии каскадом удалены вместе с newsPost.
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
  async adminListNews(pagination: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
    const offset = Math.max(pagination.offset ?? 0, 0);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.newsPost.count(),
      this.prisma.newsPost.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          tags: { include: { newsTag: true } },
          _count: { select: { blocks: true, comments: true, likes: true } },
        },
      }),
    ]);

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
      select: { id: true, status: true, newsPost: { select: { status: true } } },
    });
    if (!comment || comment.status !== CommentStatus.published || comment.newsPost.status !== ContentStatus.published) {
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
    this.common.assertFunctionalAccess(user);
    await this.moduleAccess.assertModuleAccess(user.id, "comments");

    let parentCommentId = input.parentCommentId;

    if (parentCommentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentCommentId } });
      parentCommentId = parent?.parentCommentId ?? parentCommentId;
    }

    return this.prisma.comment.create({
      data: {
        newsPostId,
        userId: user.id,
        text: input.text,
        parentCommentId,
      },
    });
  }
}

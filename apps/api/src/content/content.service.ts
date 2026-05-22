import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, LearningAccessLevel, Prisma } from "@prisma/client";
import {
  BaseContentBlock,
  canAccessLearningLevel,
  canOpenFunctionalSections,
  filterPriceIndexPoints,
  lessonBlockSchema,
  newsBlockSchema,
  slugify,
  summarizePriceIndex,
  validateContentBlocks,
} from "@ecoplatform/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { ModuleAccessService } from "../common/module-access.service";
import { sanitizeParagraphHtml } from "../common/sanitize-html";
import type { RequestUser } from "../common/request-user";
import type {
  categoryInputSchema,
  categoryUpdateInputSchema,
  chapterInputSchema,
  chapterUpdateInputSchema,
  knowledgeArticleInputSchema,
  learningModuleInputSchema,
  learningModuleUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
  newsInputSchema,
  nomenclatureInputSchema,
  nomenclatureUpdateInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
} from "./content.schemas";
import type { z } from "zod";

type NewsInput = z.infer<typeof newsInputSchema>;
type CategoryInput = z.infer<typeof categoryInputSchema>;
type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
type NomenclatureInput = z.infer<typeof nomenclatureInputSchema>;
type NomenclatureUpdateInput = z.infer<typeof nomenclatureUpdateInputSchema>;
type PriceIndexInput = z.infer<typeof priceIndexInputSchema>;
type PriceIndexValueInput = z.infer<typeof priceIndexValueInputSchema>;
type LearningModuleInput = z.infer<typeof learningModuleInputSchema>;
type LearningModuleUpdateInput = z.infer<typeof learningModuleUpdateInputSchema>;
type ChapterInput = z.infer<typeof chapterInputSchema>;
type ChapterUpdateInput = z.infer<typeof chapterUpdateInputSchema>;
type LessonInput = z.infer<typeof lessonInputSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateInputSchema>;
type KnowledgeArticleInput = z.infer<typeof knowledgeArticleInputSchema>;

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

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private assertFunctionalAccess(user: RequestUser) {
    // Эта проверка центральная для MVP: после истечения demo пользователь может
    // войти в аккаунт, но рабочие разделы закрываются до ручной активации подписки.
    if (user.platformRoles.length > 0) {
      return;
    }

    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к разделу ограничен. Активируйте подписку в кабинете.");
    }
  }

  private hasLearningAccess(user: RequestUser, accessLevel: LearningAccessLevel) {
    if (user.platformRoles.length > 0) {
      return true;
    }

    return user.company ? canAccessLearningLevel(user.company, accessLevel) : false;
  }

  private payload(block: BaseContentBlock): Prisma.InputJsonValue {
    if (block.type === "paragraph") {
      const { html } = block.payload as { html: string };
      return { html: sanitizeParagraphHtml(html) } as Prisma.InputJsonValue;
    }
    return block.payload as Prisma.InputJsonValue;
  }

  private async uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
    const root = slugify(base);
    let candidate = root;
    let index = 2;

    while (await exists(candidate)) {
      candidate = `${root}-${index}`;
      index += 1;
    }

    return candidate;
  }

  async listNews(user: RequestUser) {
    this.assertFunctionalAccess(user);

    const posts = await this.prisma.newsPost.findMany({
      where: { status: ContentStatus.published },
      orderBy: { firstPublishedAt: "desc" },
      include: {
        tags: { include: { newsTag: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
        _count: { select: { likes: true, comments: { where: { status: CommentStatus.published } } } },
      },
    });

    return posts.map(({ likes, ...post }) => ({ ...post, likedByMe: likes.length > 0 }));
  }

  async getNews(slug: string, user: RequestUser) {
    this.assertFunctionalAccess(user);

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

  private decorateCommentAuthor(user: {
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    company: { type: string } | null;
    platformStaff: { roles: string[]; isActive: boolean } | null;
  }) {
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

    const slug = input.slug ?? (await this.uniqueSlug(input.title, async (candidate) => Boolean(await this.prisma.newsPost.findUnique({ where: { slug: candidate } }))));

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
            payload: this.payload(block),
          })),
        },
      },
    });

    await this.replaceNewsTags(post.id, input.tags, user.id);

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
      include: { tags: true },
    });
    if (!before) {
      throw new NotFoundException("Новость не найдена.");
    }
    const previousTagIds = before.tags.map((tag) => tag.newsTagId);

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
              payload: this.payload(block),
            })),
          },
        },
      });
      await tx.newsPostTag.deleteMany({ where: { newsPostId: id } });
    });

    await this.replaceNewsTags(id, input.tags, user.id);
    await this.refreshTagUsage(previousTagIds);

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
      include: { tags: true },
    });
    if (!existing) {
      throw new NotFoundException("Новость не найдена.");
    }

    const affectedTagIds = existing.tags.map((tag) => tag.newsTagId);

    // Комментарии физически удаляются каскадом Comment.newsPost (onDelete: Cascade
    // в schema.prisma). Раньше мы пытались помечать им CommentStatus.removed_with_news
    // перед delete — но статус никогда не сохранялся, потому что строки сносились
    // микросекундой позже. Аудит-лог делает запись со slug и title удалённой
    // новости, этого достаточно для истории.
    await this.prisma.newsPost.delete({ where: { id } });

    await this.refreshTagUsage(affectedTagIds);

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

  async adminListNews() {
    return this.prisma.newsPost.findMany({
      orderBy: { updatedAt: "desc" },
      include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
    });
  }

  private async adminGetNews(id: string) {
    return this.prisma.newsPost.findUnique({
      where: { id },
      include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
    });
  }

  private async replaceNewsTags(newsPostId: string, tagNames: string[], actorId: string) {
    const affectedTagIds: string[] = [];

    for (const name of tagNames) {
      const tag = await this.prisma.newsTag.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name), createdById: actorId },
      });

      await this.prisma.newsPostTag.create({
        data: { newsPostId, newsTagId: tag.id },
      });

      affectedTagIds.push(tag.id);
    }

    await this.refreshTagUsage(affectedTagIds);
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
    this.assertFunctionalAccess(user);
    const post = await this.prisma.newsPost.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!post || post.status !== ContentStatus.published) {
      throw new NotFoundException("Новость не найдена.");
    }

    const existing = await this.prisma.newsLike.findUnique({ where: { userId_newsPostId: { userId: user.id, newsPostId: id } } });
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
    this.assertFunctionalAccess(user);
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
    this.assertFunctionalAccess(user);
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

  async listIndices(user: RequestUser) {
    this.assertFunctionalAccess(user);

    const stagnationThreshold = await this.settings.getValue("indices.stagnation_threshold_percent");

    const categories = await this.prisma.nomenclatureCategory.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      include: {
        nomenclatures: {
          where: { isActive: true, priceIndex: { is: { status: ContentStatus.published } } },
          include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } },
          orderBy: { name: "asc" },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      nomenclatures: category.nomenclatures
        .map((item) => {
          const values = item.priceIndex?.values.map((value) => ({ date: value.date, price: Number(value.price) })) ?? [];
          const summary = summarizePriceIndex(values, new Date(), stagnationThreshold);
          return summary
            ? {
                ...item,
                priceIndex: item.priceIndex,
                summary,
                chart: {
                  "1M": filterPriceIndexPoints(values, 30),
                  "3M": filterPriceIndexPoints(values, 90),
                  "6M": filterPriceIndexPoints(values, 180),
                  "1Y": filterPriceIndexPoints(values, 365),
                },
              }
            : null;
        })
        .filter(Boolean),
    }));
  }

  async adminListIndices() {
    return this.prisma.nomenclatureCategory.findMany({
      orderBy: { position: "asc" },
      include: {
        nomenclatures: { include: { priceIndex: { include: { values: { orderBy: { date: "asc" } } } } } },
      },
    });
  }

  async createCategory(input: CategoryInput, user: RequestUser) {
    const category = await this.prisma.nomenclatureCategory.create({
      data: { name: input.name, slug: slugify(input.name), position: input.position },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.create",
      entityType: "NomenclatureCategory",
      entityId: category.id,
    });

    return category;
  }

  async updateCategory(id: string, input: CategoryUpdateInput, user: RequestUser) {
    const existing = await this.prisma.nomenclatureCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Категория не найдена.");
    }

    const data: Prisma.NomenclatureCategoryUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      data.slug = slugify(input.name);
    }
    if (input.position !== undefined) data.position = input.position;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const category = await this.prisma.nomenclatureCategory.update({ where: { id }, data });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.update",
      entityType: "NomenclatureCategory",
      entityId: id,
      payload: input,
    });

    return category;
  }

  async deleteCategory(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.nomenclatureCategory.findUnique({
      where: { id },
      include: { _count: { select: { nomenclatures: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Категория не найдена.");
    }
    if (existing._count.nomenclatures > 0) {
      throw new ForbiddenException("Нельзя удалить категорию с привязанной номенклатурой.");
    }

    await this.prisma.nomenclatureCategory.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.category.delete",
      entityType: "NomenclatureCategory",
      entityId: id,
      comment: reason,
      payload: { name: existing.name, slug: existing.slug },
    });

    return { ok: true };
  }

  async createNomenclature(input: NomenclatureInput, user: RequestUser) {
    const nomenclature = await this.prisma.nomenclature.create({ data: input });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.create",
      entityType: "Nomenclature",
      entityId: nomenclature.id,
    });

    return nomenclature;
  }

  async updateNomenclature(id: string, input: NomenclatureUpdateInput, user: RequestUser) {
    const existing = await this.prisma.nomenclature.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Номенклатура не найдена.");
    }

    const nomenclature = await this.prisma.nomenclature.update({ where: { id }, data: input });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.update",
      entityType: "Nomenclature",
      entityId: id,
      payload: input,
    });

    return nomenclature;
  }

  async deleteNomenclature(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.nomenclature.findUnique({
      where: { id },
      include: { priceIndex: true },
    });
    if (!existing) {
      throw new NotFoundException("Номенклатура не найдена.");
    }
    if (existing.priceIndex) {
      throw new ForbiddenException("Сначала удалите индекс цены, связанный с этой номенклатурой.");
    }

    await this.prisma.nomenclature.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.nomenclature.delete",
      entityType: "Nomenclature",
      entityId: id,
      comment: reason,
      payload: { code: existing.code, name: existing.name },
    });

    return { ok: true };
  }

  async createPriceIndex(input: PriceIndexInput, user: RequestUser) {
    const priceIndex = await this.prisma.priceIndex.create({ data: { ...input, createdById: user.id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.create",
      entityType: "PriceIndex",
      entityId: priceIndex.id,
    });

    return priceIndex;
  }

  async addPriceValue(id: string, input: PriceIndexValueInput, user: RequestUser) {
    return this.prisma.priceIndexValue.upsert({
      where: { priceIndexId_date: { priceIndexId: id, date: new Date(input.date) } },
      update: { price: input.price },
      create: { priceIndexId: id, date: new Date(input.date), price: input.price, createdById: user.id },
    });
  }

  async deletePriceValue(indexId: string, valueId: string, user: RequestUser) {
    const value = await this.prisma.priceIndexValue.findUnique({ where: { id: valueId } });
    if (!value || value.priceIndexId !== indexId) {
      throw new NotFoundException("Значение индекса не найдено.");
    }

    await this.prisma.priceIndexValue.delete({ where: { id: valueId } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.value.delete",
      entityType: "PriceIndexValue",
      entityId: valueId,
      payload: { priceIndexId: indexId, date: value.date.toISOString(), price: value.price.toString() },
    });

    return { ok: true };
  }

  async publishPriceIndex(id: string, user: RequestUser) {
    const existing = await this.prisma.priceIndex.findUnique({
      where: { id },
      include: { _count: { select: { values: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }
    if (existing._count.values === 0) {
      throw new ForbiddenException("Нельзя опубликовать индекс без значений.");
    }

    const priceIndex = await this.prisma.priceIndex.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.publish",
      entityType: "PriceIndex",
      entityId: id,
    });

    return priceIndex;
  }

  async unpublishPriceIndex(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.priceIndex.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }

    const priceIndex = await this.prisma.priceIndex.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.unpublish",
      entityType: "PriceIndex",
      entityId: id,
      comment: reason,
    });

    return priceIndex;
  }

  async deletePriceIndex(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.priceIndex.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Индекс не найден.");
    }

    await this.prisma.priceIndex.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "indices.index.delete",
      entityType: "PriceIndex",
      entityId: id,
      comment: reason,
      payload: { nomenclatureId: existing.nomenclatureId },
    });

    return { ok: true };
  }

  async listLearningModules(user: RequestUser) {
    this.assertFunctionalAccess(user);
    const modules = await this.prisma.learningModule.findMany({
      where: { status: ContentStatus.published },
      orderBy: { createdAt: "desc" },
      include: {
        chapters: {
          include: {
            lessons: { where: { status: ContentStatus.published }, orderBy: { position: "asc" } },
          },
          orderBy: { position: "asc" },
        },
      },
    });

    return modules.map((module) => ({
      ...module,
      hasAccess: this.hasLearningAccess(user, module.accessLevel),
    }));
  }

  async getLearningModule(id: string, user: RequestUser) {
    this.assertFunctionalAccess(user);
    const module = await this.prisma.learningModule.findUnique({
      where: { id },
      include: {
        preview: true,
        chapters: {
          orderBy: { position: "asc" },
          include: {
            lessons: {
              where: { status: ContentStatus.published },
              orderBy: { position: "asc" },
              include: {
                blocks: { orderBy: { position: "asc" } },
                attachments: true,
              },
            },
          },
        },
      },
    });

    if (!module || module.status !== ContentStatus.published) {
      throw new NotFoundException("Модуль не найден.");
    }

    const hasAccess = this.hasLearningAccess(user, module.accessLevel);
    return { ...module, hasAccess };
  }

  async adminListLearningModules() {
    return this.prisma.learningModule.findMany({
      orderBy: { updatedAt: "desc" },
      include: { preview: true, chapters: { include: { lessons: { include: { blocks: true, attachments: true } } } } },
    });
  }

  async createLearningModule(input: LearningModuleInput, user: RequestUser) {
    for (const chapter of input.chapters) {
      for (const lesson of chapter.lessons) {
        const check = validateContentBlocks(lesson.blocks, lessonBlockSchema);

        if (!check.ok) {
          throw new ForbiddenException(check.message);
        }
      }
    }

    const module = await this.prisma.learningModule.create({
      data: {
        title: input.title,
        summary: input.summary,
        description: input.description,
        coverImageId: input.coverImageId,
        accessLevel: input.accessLevel,
        oneTimePrice: input.oneTimePrice,
        createdById: user.id,
        preview: {
          create: {
            promotionalDescription: input.preview.promotionalDescription,
            whatYouWillLearn: input.preview.whatYouWillLearn,
          },
        },
        chapters: {
          create: input.chapters.map((chapter, chapterIndex) => ({
            title: chapter.title,
            position: chapterIndex,
            createdById: user.id,
            lessons: {
              create: chapter.lessons.map((lesson, lessonIndex) => ({
                title: lesson.title,
                position: lessonIndex,
                createdById: user.id,
                blocks: {
                  create: lesson.blocks.map((block, blockIndex) => ({
                    position: blockIndex,
                    type: block.type,
                    payload: this.payload(block),
                  })),
                },
                attachments: {
                  create: lesson.attachments.map((attachment, position) => ({
                    fileId: attachment.fileId,
                    displayName: attachment.displayName,
                    position,
                  })),
                },
              })),
            },
          })),
        },
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.create",
      entityType: "LearningModule",
      entityId: module.id,
    });

    return module;
  }

  async publishLearningModule(id: string, user: RequestUser) {
    const existing = await this.prisma.learningModule.findUnique({
      where: { id },
      include: { chapters: { include: { lessons: { include: { _count: { select: { blocks: true } } } } } } },
    });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }
    if (existing.chapters.length === 0) {
      throw new ForbiddenException("Нельзя опубликовать модуль без глав.");
    }
    for (const chapter of existing.chapters) {
      if (chapter.lessons.length === 0) {
        throw new ForbiddenException(`В главе «${chapter.title}» нет уроков.`);
      }
      for (const lesson of chapter.lessons) {
        if (lesson._count.blocks === 0) {
          throw new ForbiddenException(`Урок «${lesson.title}» не содержит блоков.`);
        }
      }
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const module = await tx.learningModule.update({
        where: { id },
        data: {
          status: ContentStatus.published,
          firstPublishedAt: existing.firstPublishedAt ?? now,
        },
        include: { chapters: { include: { lessons: true } } },
      });

      const lessonIds = module.chapters.flatMap((chapter) =>
        chapter.lessons.filter((lesson) => lesson.status === ContentStatus.draft).map((lesson) => lesson.id),
      );

      if (lessonIds.length > 0) {
        await tx.lesson.updateMany({
          where: { id: { in: lessonIds } },
          data: { status: ContentStatus.published, firstPublishedAt: now },
        });
      }

      return module;
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.publish",
      entityType: "LearningModule",
      entityId: id,
    });

    return result;
  }

  async unpublishLearningModule(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.learningModule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }

    const module = await this.prisma.learningModule.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.unpublish",
      entityType: "LearningModule",
      entityId: id,
      comment: reason,
    });

    return module;
  }

  async updateLearningModule(id: string, input: LearningModuleUpdateInput, user: RequestUser) {
    const existing = await this.prisma.learningModule.findUnique({
      where: { id },
      include: { preview: true },
    });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }

    const data: Prisma.LearningModuleUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.description !== undefined) data.description = input.description;
    if (input.coverImageId !== undefined) data.coverImageId = input.coverImageId;
    if (input.accessLevel !== undefined) data.accessLevel = input.accessLevel;
    if (input.oneTimePrice !== undefined) data.oneTimePrice = input.oneTimePrice;

    if (input.preview) {
      data.preview = {
        upsert: {
          create: {
            promotionalDescription: input.preview.promotionalDescription,
            whatYouWillLearn: input.preview.whatYouWillLearn,
          },
          update: {
            promotionalDescription: input.preview.promotionalDescription,
            whatYouWillLearn: input.preview.whatYouWillLearn,
          },
        },
      };
    }

    const module = await this.prisma.learningModule.update({
      where: { id },
      data,
      include: { preview: true },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.update",
      entityType: "LearningModule",
      entityId: id,
      payload: input,
    });

    return module;
  }

  async deleteLearningModule(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.learningModule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }

    await this.prisma.learningModule.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.delete",
      entityType: "LearningModule",
      entityId: id,
      comment: reason,
      payload: { title: existing.title },
    });

    return { ok: true };
  }

  async createChapter(moduleId: string, input: ChapterInput, user: RequestUser) {
    const module = await this.prisma.learningModule.findUnique({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException("Модуль не найден.");
    }

    const chapter = await this.prisma.chapter.create({
      data: {
        moduleId,
        title: input.title,
        position: input.position,
        createdById: user.id,
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.create",
      entityType: "Chapter",
      entityId: chapter.id,
      payload: { moduleId },
    });

    return chapter;
  }

  async updateChapter(id: string, input: ChapterUpdateInput, user: RequestUser) {
    const existing = await this.prisma.chapter.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Глава не найдена.");
    }

    const positionChanged = input.position !== undefined && input.position !== existing.position;

    const chapter = await this.prisma.$transaction(async (tx) => {
      if (positionChanged) {
        await this.repositionChapter(tx, existing.moduleId, id, input.position!);
      }
      const data: Prisma.ChapterUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (Object.keys(data).length === 0 && !positionChanged) {
        return existing;
      }
      return tx.chapter.update({ where: { id }, data });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.update",
      entityType: "Chapter",
      entityId: id,
      payload: input,
    });

    return chapter;
  }

  async deleteChapter(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.chapter.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Глава не найдена.");
    }
    if (existing._count.lessons > 0) {
      throw new ForbiddenException("Нельзя удалить главу с уроками.");
    }

    await this.prisma.chapter.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.delete",
      entityType: "Chapter",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, moduleId: existing.moduleId },
    });

    return { ok: true };
  }

  async createLesson(chapterId: string, input: LessonInput, user: RequestUser) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      throw new NotFoundException("Глава не найдена.");
    }

    const check = validateContentBlocks(input.blocks, lessonBlockSchema);
    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

    const lesson = await this.prisma.lesson.create({
      data: {
        chapterId,
        title: input.title,
        position: input.position,
        createdById: user.id,
        blocks: {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.payload(block),
          })),
        },
        attachments: {
          create: input.attachments.map((attachment, position) => ({
            fileId: attachment.fileId,
            displayName: attachment.displayName,
            position,
          })),
        },
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.create",
      entityType: "Lesson",
      entityId: lesson.id,
      payload: { chapterId },
    });

    return lesson;
  }

  async updateLesson(id: string, input: LessonUpdateInput, user: RequestUser) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }

    if (input.blocks) {
      const check = validateContentBlocks(input.blocks, lessonBlockSchema);
      if (!check.ok) {
        throw new ForbiddenException(check.message);
      }
    }

    const positionChanged = input.position !== undefined && input.position !== existing.position;

    const lesson = await this.prisma.$transaction(async (tx) => {
      if (positionChanged) {
        await this.repositionLesson(tx, existing.chapterId, id, input.position!);
      }

      const data: Prisma.LessonUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;

      if (input.blocks) {
        await tx.lessonContentBlock.deleteMany({ where: { lessonId: id } });
        data.blocks = {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.payload(block),
          })),
        };
      }

      if (input.attachments) {
        await tx.lessonAttachment.deleteMany({ where: { lessonId: id } });
        data.attachments = {
          create: input.attachments.map((attachment, position) => ({
            fileId: attachment.fileId,
            displayName: attachment.displayName,
            position,
          })),
        };
      }

      return tx.lesson.update({ where: { id }, data });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.update",
      entityType: "Lesson",
      entityId: id,
    });

    return lesson;
  }

  async deleteLesson(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }

    await this.prisma.lesson.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.delete",
      entityType: "Lesson",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, chapterId: existing.chapterId },
    });

    return { ok: true };
  }

  async unpublishLesson(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.unpublish",
      entityType: "Lesson",
      entityId: id,
      comment: reason,
    });

    return lesson;
  }

  async publishLesson(id: string, user: RequestUser) {
    const existing = await this.prisma.lesson.findUnique({
      where: { id },
      include: { _count: { select: { blocks: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }
    if (existing._count.blocks === 0) {
      throw new ForbiddenException("Нельзя опубликовать урок без блоков.");
    }

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.publish",
      entityType: "Lesson",
      entityId: id,
    });

    return lesson;
  }

  async completeLesson(lessonId: string, user: RequestUser) {
    this.assertFunctionalAccess(user);
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      update: {},
      create: { userId: user.id, lessonId },
    });
  }

  async knowledgeTree(user: RequestUser) {
    this.assertFunctionalAccess(user);
    return this.prisma.knowledgeBaseArticle.findMany({
      where: { parentId: null, status: ContentStatus.published },
      orderBy: { position: "asc" },
      include: {
        blocks: { orderBy: { position: "asc" } },
        children: {
          where: { status: ContentStatus.published },
          orderBy: { position: "asc" },
          include: {
            blocks: { orderBy: { position: "asc" } },
            children: {
              where: { status: ContentStatus.published },
              orderBy: { position: "asc" },
              include: { blocks: { orderBy: { position: "asc" } } },
            },
          },
        },
      },
    });
  }

  async getKnowledgeArticle(slug: string, user: RequestUser) {
    this.assertFunctionalAccess(user);
    const article = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { slug },
      include: { parent: { include: { parent: true } }, children: true, blocks: { orderBy: { position: "asc" } } },
    });

    if (!article || article.status !== ContentStatus.published || article.parent?.status === "draft" || article.parent?.parent?.status === "draft") {
      throw new NotFoundException("Статья не найдена.");
    }

    return article;
  }

  async searchKnowledge(query: string, user: RequestUser) {
    this.assertFunctionalAccess(user);
    return this.prisma.knowledgeBaseArticle.findMany({
      where: {
        status: ContentStatus.published,
        OR: [{ title: { contains: query, mode: "insensitive" } }, { subtitle: { contains: query, mode: "insensitive" } }],
      },
      take: 50,
      orderBy: { title: "asc" },
    });
  }

  async adminListKnowledge() {
    return this.prisma.knowledgeBaseArticle.findMany({
      orderBy: [{ parentId: "asc" }, { position: "asc" }],
      include: { blocks: { orderBy: { position: "asc" } } },
    });
  }

  async createKnowledgeArticle(input: KnowledgeArticleInput, user: RequestUser) {
    const check = validateContentBlocks(input.blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

    await this.assertKnowledgeDepth(input.parentId ?? null);

    const slug = input.slug ?? (await this.uniqueSlug(input.title, async (candidate) => Boolean(await this.prisma.knowledgeBaseArticle.findUnique({ where: { slug: candidate } }))));

    const article = await this.prisma.knowledgeBaseArticle.create({
      data: {
        parentId: input.parentId ?? null,
        title: input.title,
        subtitle: input.subtitle,
        coverImageId: input.coverImageId,
        slug,
        position: input.position,
        iconType: input.iconType,
        createdById: user.id,
        blocks: {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.payload(block),
          })),
        },
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.create",
      entityType: "KnowledgeBaseArticle",
      entityId: article.id,
    });

    return article;
  }

  async updateKnowledgeArticle(id: string, input: KnowledgeArticleInput, user: RequestUser) {
    const check = validateContentBlocks(input.blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

    const existing = await this.prisma.knowledgeBaseArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }

    const article = await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeBaseBlock.deleteMany({ where: { articleId: id } });
      await tx.knowledgeBaseArticle.update({
        where: { id },
        data: {
          title: input.title,
          subtitle: input.subtitle,
          coverImageId: input.coverImageId,
          iconType: input.iconType,
          blocks: {
            create: input.blocks.map((block, position) => ({
              position,
              type: block.type,
              payload: this.payload(block),
            })),
          },
        },
      });
      return tx.knowledgeBaseArticle.findUniqueOrThrow({
        where: { id },
        include: { blocks: { orderBy: { position: "asc" } } },
      });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.update",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
    });

    return article;
  }

  async publishKnowledgeArticle(id: string, user: RequestUser) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id },
      include: { _count: { select: { blocks: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }
    if (existing._count.blocks === 0) {
      throw new ForbiddenException("Нельзя опубликовать статью без блоков.");
    }

    const article = await this.prisma.knowledgeBaseArticle.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.publish",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
    });

    return article;
  }

  async unpublishKnowledgeArticle(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }

    const article = await this.prisma.knowledgeBaseArticle.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.unpublish",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
      comment: reason,
    });

    return article;
  }

  async moveKnowledgeArticle(
    id: string,
    input: { parentId: string | null; position: number },
    user: RequestUser,
  ) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }

    if (input.parentId === id) {
      throw new ForbiddenException("Статья не может быть собственным родителем.");
    }

    await this.assertKnowledgeDepth(input.parentId, id);

    const parentChanged = existing.parentId !== input.parentId;
    const positionChanged = existing.position !== input.position;

    const article = await this.prisma.$transaction(async (tx) => {
      if (parentChanged) {
        // При смене родителя сначала отпускаем место в старой группе, чтобы
        // соседи перенумеровались без дыр в position. Затем вставляем в новую.
        await tx.knowledgeBaseArticle.update({
          where: { id },
          data: { position: -1_000_000 - existing.position },
        });
        await this.compactKnowledgeAfterRemoval(tx, existing.parentId, existing.position);
        await this.repositionKnowledgeInGroup(tx, input.parentId, id, input.position, true);
      } else if (positionChanged) {
        await this.repositionKnowledgeInGroup(tx, input.parentId, id, input.position, false);
      }

      if (parentChanged) {
        return tx.knowledgeBaseArticle.update({
          where: { id },
          data: { parentId: input.parentId },
        });
      }
      return tx.knowledgeBaseArticle.findUniqueOrThrow({ where: { id } });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.move",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
      payload: {
        from: { parentId: existing.parentId, position: existing.position },
        to: { parentId: input.parentId, position: input.position },
      },
    });

    return article;
  }

  async deleteKnowledgeArticle(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }
    if (existing._count.children > 0) {
      throw new ForbiddenException("Нельзя удалить статью с дочерними узлами. Сначала переместите или удалите их.");
    }

    await this.prisma.knowledgeBaseArticle.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.delete",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, slug: existing.slug, parentId: existing.parentId },
    });

    return { ok: true };
  }

  private async assertKnowledgeDepth(parentId: string | null, movingId?: string) {
    if (!parentId) {
      return;
    }

    const depth = await this.knowledgeDepth(parentId);
    // Допустимы уровни 0, 1, 2 (категория → вид → подвид). Новый ребёнок добавит уровень depth+1.
    if (depth + 1 > 2) {
      throw new ForbiddenException("Дерево базы знаний ограничено тремя уровнями.");
    }

    if (movingId) {
      const subtreeDepth = await this.subtreeDepth(movingId);
      if (depth + 1 + subtreeDepth > 2) {
        throw new ForbiddenException("Перемещение нарушит ограничение в три уровня.");
      }
    }
  }

  private async knowledgeDepth(nodeId: string): Promise<number> {
    let current: string | null = nodeId;
    let depth = 0;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current)) {
        throw new ForbiddenException("Циклическая структура в дереве базы знаний.");
      }
      visited.add(current);
      const node: { parentId: string | null } | null = await this.prisma.knowledgeBaseArticle.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!node) {
        break;
      }
      if (node.parentId === null) {
        return depth;
      }
      depth += 1;
      current = node.parentId;
    }

    return depth;
  }

  private async subtreeDepth(nodeId: string): Promise<number> {
    const children = await this.prisma.knowledgeBaseArticle.findMany({
      where: { parentId: nodeId },
      select: { id: true },
    });
    if (children.length === 0) {
      return 0;
    }
    const depths = await Promise.all(children.map((child) => this.subtreeDepth(child.id)));
    return 1 + Math.max(...depths);
  }

  // Перепаковка позиций внутри группы (главы модуля).
  // Уникальный индекс @@unique([moduleId, position]) не позволяет двум главам
  // занимать одну позицию — даже временно. Поэтому сначала уводим всех соседей
  // в заведомо свободную зону отрицательных значений, а потом раздаём финальные
  // номера 0..N-1 уже в нужном порядке.
  private async repositionChapter(
    tx: Prisma.TransactionClient,
    moduleId: string,
    itemId: string,
    newPosition: number,
  ) {
    const siblings = await tx.chapter.findMany({
      where: { moduleId, id: { not: itemId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await tx.chapter.update({ where: { id: itemId }, data: { position: -1 } });
    for (let i = 0; i < siblings.length; i++) {
      await tx.chapter.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
    }

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.chapter.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  private async repositionLesson(
    tx: Prisma.TransactionClient,
    chapterId: string,
    itemId: string,
    newPosition: number,
  ) {
    const siblings = await tx.lesson.findMany({
      where: { chapterId, id: { not: itemId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await tx.lesson.update({ where: { id: itemId }, data: { position: -1 } });
    for (let i = 0; i < siblings.length; i++) {
      await tx.lesson.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
    }

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.lesson.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  // Для статьи базы знаний: возможно потребовать вставку с уже «выведенным» из
  // старой группы элементом (skipItemInGroup=true) — в этом случае ищем соседей
  // без него и вставляем его как новичка. Полезно при смене родителя.
  private async repositionKnowledgeInGroup(
    tx: Prisma.TransactionClient,
    parentId: string | null,
    itemId: string,
    newPosition: number,
    isNewcomer: boolean,
  ) {
    const siblings = await tx.knowledgeBaseArticle.findMany({
      where: { parentId, id: { not: itemId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    if (!isNewcomer) {
      await tx.knowledgeBaseArticle.update({ where: { id: itemId }, data: { position: -1 } });
    }
    for (let i = 0; i < siblings.length; i++) {
      await tx.knowledgeBaseArticle.update({
        where: { id: siblings[i]!.id },
        data: { position: -(i + 2) },
      });
    }

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.knowledgeBaseArticle.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  // При переходе статьи в другую родительскую группу — нужно «закрыть дыру»,
  // которую она оставила: оставшиеся соседи перенумеровываются без неё.
  private async compactKnowledgeAfterRemoval(
    tx: Prisma.TransactionClient,
    parentId: string | null,
    removedPosition: number,
  ) {
    const remaining = await tx.knowledgeBaseArticle.findMany({
      where: { parentId, position: { gt: removedPosition } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    for (const node of remaining) {
      await tx.knowledgeBaseArticle.update({
        where: { id: node.id },
        data: { position: node.position - 1 },
      });
    }
  }
}

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

const companyAvatarPrefixByType: Record<string, string> = {
  collector: "z",
  trader: "t",
  processor: "p",
};

const avatarSuffixByGender: Record<string, string> = {
  male: "man",
  female: "woman",
};

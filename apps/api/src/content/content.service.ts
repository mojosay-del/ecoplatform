import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, Prisma } from "@prisma/client";
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
import { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import type {
  categoryInputSchema,
  knowledgeArticleInputSchema,
  learningModuleInputSchema,
  newsInputSchema,
  nomenclatureInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
} from "./content.schemas";
import type { z } from "zod";

type NewsInput = z.infer<typeof newsInputSchema>;
type CategoryInput = z.infer<typeof categoryInputSchema>;
type NomenclatureInput = z.infer<typeof nomenclatureInputSchema>;
type PriceIndexInput = z.infer<typeof priceIndexInputSchema>;
type PriceIndexValueInput = z.infer<typeof priceIndexValueInputSchema>;
type LearningModuleInput = z.infer<typeof learningModuleInputSchema>;
type KnowledgeArticleInput = z.infer<typeof knowledgeArticleInputSchema>;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  private assertFunctionalAccess(user: RequestUser) {
    // Эта проверка центральная для MVP: после истечения demo пользователь может
    // войти в аккаунт, но рабочие разделы закрываются до ручной активации подписки.
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к разделу ограничен. Активируйте подписку в кабинете.");
    }
  }

  private payload(block: BaseContentBlock): Prisma.InputJsonValue {
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

    return this.prisma.newsPost.findMany({
      where: { status: ContentStatus.published },
      orderBy: { firstPublishedAt: "desc" },
      include: { tags: { include: { newsTag: true } }, _count: { select: { likes: true, comments: true } } },
    });
  }

  async getNews(slug: string, user: RequestUser) {
    this.assertFunctionalAccess(user);

    const post = await this.prisma.newsPost.findUnique({
      where: { slug },
      include: {
        blocks: { orderBy: { position: "asc" } },
        tags: { include: { newsTag: true } },
        comments: {
          where: { parentCommentId: null },
          orderBy: { createdAt: "desc" },
          include: {
            user: true,
            replies: { orderBy: { createdAt: "asc" }, include: { user: true, _count: { select: { likes: true } } } },
            _count: { select: { likes: true } },
          },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    if (!post || post.status !== ContentStatus.published) {
      throw new NotFoundException("Новость не найдена.");
    }

    return post;
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

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.updateMany({
        where: { newsPostId: id, status: CommentStatus.published },
        data: { status: CommentStatus.removed_with_news },
      });
      await tx.newsPost.delete({ where: { id } });
    });

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
    const existing = await this.prisma.newsLike.findUnique({ where: { userId_newsPostId: { userId: user.id, newsPostId: id } } });

    if (existing) {
      await this.prisma.newsLike.delete({ where: { id: existing.id } });
      return { liked: false };
    }

    await this.prisma.newsLike.create({ data: { userId: user.id, newsPostId: id } });
    return { liked: true };
  }

  async addNewsComment(newsPostId: string, user: RequestUser, input: { text: string; parentCommentId?: string }) {
    this.assertFunctionalAccess(user);

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
          const summary = summarizePriceIndex(values);
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

  async createCategory(input: CategoryInput) {
    return this.prisma.nomenclatureCategory.create({ data: { name: input.name, slug: slugify(input.name), position: input.position } });
  }

  async createNomenclature(input: NomenclatureInput) {
    return this.prisma.nomenclature.create({ data: input });
  }

  async createPriceIndex(input: PriceIndexInput, user: RequestUser) {
    return this.prisma.priceIndex.create({ data: { ...input, createdById: user.id } });
  }

  async addPriceValue(id: string, input: PriceIndexValueInput, user: RequestUser) {
    return this.prisma.priceIndexValue.upsert({
      where: { priceIndexId_date: { priceIndexId: id, date: new Date(input.date) } },
      update: { price: input.price },
      create: { priceIndexId: id, date: new Date(input.date), price: input.price, createdById: user.id },
    });
  }

  async publishPriceIndex(id: string) {
    return this.prisma.priceIndex.update({
      where: { id },
      data: { status: ContentStatus.published, firstPublishedAt: new Date() },
    });
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
      hasAccess: user.company ? canAccessLearningLevel(user.company, module.accessLevel) : false,
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

    const hasAccess = user.company ? canAccessLearningLevel(user.company, module.accessLevel) : false;
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

    return this.prisma.learningModule.create({
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
            lessons: {
              create: chapter.lessons.map((lesson, lessonIndex) => ({
                title: lesson.title,
                position: lessonIndex,
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
  }

  async publishLearningModule(id: string) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const module = await tx.learningModule.update({
        where: { id },
        data: { status: ContentStatus.published, firstPublishedAt: now },
        include: { chapters: { include: { lessons: true } } },
      });

      const lessonIds = module.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id));

      if (lessonIds.length > 0) {
        await tx.lesson.updateMany({
          where: { id: { in: lessonIds } },
          data: { status: ContentStatus.published, firstPublishedAt: now },
        });
      }

      return module;
    });
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
        children: {
          where: { status: ContentStatus.published },
          orderBy: { position: "asc" },
          include: { children: { where: { status: ContentStatus.published }, orderBy: { position: "asc" } } },
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

    const article = await this.prisma.knowledgeBaseArticle.update({
      where: { id },
      data: { parentId: input.parentId, position: input.position },
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
}

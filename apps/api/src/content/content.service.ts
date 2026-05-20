import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import {
  BaseContentBlock,
  canAccessLearningLevel,
  canOpenFunctionalSections,
  filterPriceIndexPoints,
  slugify,
  summarizePriceIndex,
  validateContentBlocks,
} from "@ecoplatform/shared";
import { PrismaService } from "../prisma/prisma.service";
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
  constructor(private readonly prisma: PrismaService) {}

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
    const check = validateContentBlocks(input.blocks);

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

    await this.replaceNewsTags(post.id, input.tags);
    return this.adminGetNews(post.id);
  }

  async updateNews(id: string, input: NewsInput) {
    const check = validateContentBlocks(input.blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

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

    await this.replaceNewsTags(id, input.tags);
    return this.adminGetNews(id);
  }

  async publishNews(id: string) {
    return this.prisma.newsPost.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: new Date(),
      },
    });
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

  private async replaceNewsTags(newsPostId: string, tagNames: string[]) {
    for (const name of tagNames) {
      const tag = await this.prisma.newsTag.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name) },
      });

      await this.prisma.newsPostTag.create({
        data: { newsPostId, newsTagId: tag.id },
      });
    }
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
      include: { chapters: { include: { lessons: true } } },
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
    return this.prisma.learningModule.update({
      where: { id },
      data: { status: ContentStatus.published, firstPublishedAt: new Date() },
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

    const slug = input.slug ?? (await this.uniqueSlug(input.title, async (candidate) => Boolean(await this.prisma.knowledgeBaseArticle.findUnique({ where: { slug: candidate } }))));

    return this.prisma.knowledgeBaseArticle.create({
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
  }

  async publishKnowledgeArticle(id: string) {
    return this.prisma.knowledgeBaseArticle.update({
      where: { id },
      data: { status: ContentStatus.published, firstPublishedAt: new Date() },
    });
  }
}

import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { validateContentBlocks } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type { knowledgeArticleInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import { buildKnowledgeTreeInclude } from "./knowledge-base-tree.helpers";
import { assertKnowledgeDepth, isKnowledgeCategory } from "./knowledge-base-depth.helpers";
import { compactKnowledgeAfterRemoval, repositionKnowledgeInGroup } from "./knowledge-base-position.helpers";

type KnowledgeArticleInput = z.infer<typeof knowledgeArticleInputSchema>;

// База знаний: дерево статей до 3 уровней (категория → вид → подвид). Сложная
// часть — позиции внутри одной группы (drag-and-drop) и проверка глубины —
// вынесена в knowledge-base-{position,depth,tree}.helpers. Здесь — оркестрация.
@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly common: ContentCommonService,
  ) {}

  async knowledgeTree(user: RequestUser, options: { limit?: number; depth?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const width = resolvePagination({ limit: options.limit }, { defaultLimit: 100, maxLimit: 200 }).limit;
    const rawDepth = Number.isFinite(options.depth) ? Math.trunc(options.depth!) : 3;
    const depth = Math.min(Math.max(rawDepth, 1), 3);

    return this.prisma.knowledgeBaseArticle.findMany({
      where: { parentId: null, status: ContentStatus.published },
      orderBy: { position: "asc" },
      take: width,
      include: buildKnowledgeTreeInclude(depth, width),
    });
  }

  async getKnowledgeArticle(slug: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const article = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { slug },
      include: { parent: { include: { parent: true } }, children: true, blocks: { orderBy: { position: "asc" } } },
    });

    if (
      !article ||
      article.status !== ContentStatus.published ||
      article.parent?.status === "draft" ||
      article.parent?.parent?.status === "draft"
    ) {
      throw new NotFoundException("Статья не найдена.");
    }

    return article;
  }

  async searchKnowledge(query: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    return this.prisma.knowledgeBaseArticle.findMany({
      where: {
        status: ContentStatus.published,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { subtitle: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 50,
      orderBy: { title: "asc" },
    });
  }

  async adminListKnowledge(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 100, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.knowledgeBaseArticle.count(),
      this.prisma.knowledgeBaseArticle.findMany({
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: { blocks: { orderBy: { position: "asc" } } },
      }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  async createKnowledgeArticle(input: KnowledgeArticleInput, user: RequestUser) {
    const isCategory = isKnowledgeCategory(input.iconType);
    const blocks = isCategory ? [] : input.blocks;
    const check = this.validateDraftableKnowledgeBlocks(blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    if (isCategory && (input.parentId ?? null) !== null) {
      throw new ForbiddenException("Категория базы знаний должна быть верхним узлом.");
    }
    await this.common.assertCoverImageAllowed(input.coverImageId, user);

    await assertKnowledgeDepth(this.prisma, input.parentId ?? null);

    const slug =
      input.slug ??
      (await this.common.uniqueSlug(input.title, async (candidate) =>
        Boolean(await this.prisma.knowledgeBaseArticle.findUnique({ where: { slug: candidate } })),
      ));

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
          create: blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
          })),
        },
      },
    });

    await this.common.recordEntityReferences("knowledge_base_article", article.id, [
      input.coverImageId,
      ...blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.create",
      entityType: "KnowledgeBaseArticle",
      entityId: article.id,
    });

    return article;
  }

  async updateKnowledgeArticle(id: string, input: KnowledgeArticleInput, user: RequestUser) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id },
      include: { blocks: true },
    });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }

    const isCategory = isKnowledgeCategory(input.iconType);
    const blocks = isCategory ? [] : input.blocks;
    const check = this.validateDraftableKnowledgeBlocks(blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    if (isCategory && (input.parentId ?? existing.parentId) !== null) {
      throw new ForbiddenException("Категория базы знаний должна быть верхним узлом.");
    }
    if (!isCategory && existing.status === ContentStatus.published && blocks.length === 0) {
      throw new ForbiddenException("Нельзя сохранить опубликованный материал без блоков.");
    }
    await this.common.assertCoverImageAllowed(input.coverImageId, user);

    const previousFileIds = this.common.compactFileIds([
      existing.coverImageId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
    ]);

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
            create: blocks.map((block, position) => ({
              position,
              type: block.type,
              payload: this.common.payload(block),
            })),
          },
        },
      });
      return tx.knowledgeBaseArticle.findUniqueOrThrow({
        where: { id },
        include: { blocks: { orderBy: { position: "asc" } } },
      });
    });

    await this.common.recordEntityReferences("knowledge_base_article", id, [
      input.coverImageId,
      ...blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "knowledge.update",
      entityType: "KnowledgeBaseArticle",
      entityId: id,
    });

    await this.common.cleanupDetachedFiles(previousFileIds);

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
    if (!isKnowledgeCategory(existing.iconType) && existing._count.blocks === 0) {
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

  async moveKnowledgeArticle(id: string, input: { parentId: string | null; position: number }, user: RequestUser) {
    const existing = await this.prisma.knowledgeBaseArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }

    if (input.parentId === id) {
      throw new ForbiddenException("Статья не может быть собственным родителем.");
    }
    if (isKnowledgeCategory(existing.iconType) && input.parentId !== null) {
      throw new ForbiddenException("Категория базы знаний должна оставаться верхним узлом.");
    }

    await assertKnowledgeDepth(this.prisma, input.parentId, id);

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
        await compactKnowledgeAfterRemoval(tx, existing.parentId, existing.position);
        await repositionKnowledgeInGroup(tx, input.parentId, id, input.position, true);
      } else if (positionChanged) {
        await repositionKnowledgeInGroup(tx, input.parentId, id, input.position, false);
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
      include: { blocks: true, _count: { select: { children: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }
    if (existing._count.children > 0) {
      throw new ForbiddenException("Нельзя удалить статью с дочерними узлами. Сначала переместите или удалите их.");
    }
    const deletedFileIds = this.common.compactFileIds([
      existing.coverImageId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
    ]);

    await this.prisma.knowledgeBaseArticle.delete({ where: { id } });
    await this.common.clearEntityReferences("knowledge_base_article", id);
    await this.common.cleanupDetachedFiles(deletedFileIds);

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

  private validateDraftableKnowledgeBlocks(blocks: KnowledgeArticleInput["blocks"]) {
    if (blocks.length === 0) {
      return { ok: true as const };
    }
    return validateContentBlocks(blocks);
  }
}

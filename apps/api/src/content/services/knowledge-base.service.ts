import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { lessonBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type { knowledgeArticleInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";

type KnowledgeArticleInput = z.infer<typeof knowledgeArticleInputSchema>;

// База знаний: дерево статей до 2 уровней (категория → подкатегория → статья).
// Сложная часть — позиции внутри одной группы (для drag-and-drop) и проверка
// глубины (assertKnowledgeDepth). Вынесена из ContentService последней.
@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly common: ContentCommonService,
  ) {}

  async knowledgeTree(user: RequestUser) {
    this.common.assertFunctionalAccess(user);
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

  async adminListKnowledge() {
    return this.prisma.knowledgeBaseArticle.findMany({
      orderBy: [{ parentId: "asc" }, { position: "asc" }],
      include: { blocks: { orderBy: { position: "asc" } } },
    });
  }

  async createKnowledgeArticle(input: KnowledgeArticleInput, user: RequestUser) {
    const isCategory = this.isKnowledgeCategory(input.iconType);
    const check = isCategory ? { ok: true as const } : validateContentBlocks(input.blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

    await this.assertKnowledgeDepth(input.parentId ?? null);

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
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
          })),
        },
      },
    });

    await this.common.recordEntityReferences("knowledge_base_article", article.id, [
      input.coverImageId,
      ...input.blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
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
    const isCategory = this.isKnowledgeCategory(input.iconType);
    const check = isCategory ? { ok: true as const } : validateContentBlocks(input.blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }

    const existing = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id },
      include: { blocks: true },
    });
    if (!existing) {
      throw new NotFoundException("Статья не найдена.");
    }
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
            create: input.blocks.map((block, position) => ({
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
      ...input.blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
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
    if (!this.isKnowledgeCategory(existing.iconType) && existing._count.blocks === 0) {
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

  private isKnowledgeCategory(iconType?: string | null) {
    return iconType === "category";
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

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { validateContentBlocks } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import type { z } from "zod";
import type { documentationArticleInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import { buildDocumentationTreeInclude } from "./documentation-tree.helpers";
import { assertDocumentationDepth, isDocumentationCategory } from "./documentation-depth.helpers";
import { compactDocumentationAfterRemoval, repositionDocumentationInGroup } from "./documentation-position.helpers";
import {
  DOCUMENT_LEAF_FILTER,
  mapDocumentationDetail,
  mapDocumentationNode,
  type DocumentationArticleRow,
} from "./documentation-response.helpers";

type DocumentationInput = z.infer<typeof documentationArticleInputSchema>;

const RECENT_DEFAULT_LIMIT = 8;
const PINNED_LIMIT = 12;

// База документации: дерево разделов (category) → документы, до 3 уровней. По
// механике — близнец KnowledgeBaseService (позиции/глубина/файлы вынесены в
// documentation-{position,depth,tree,response}.helpers), но документ —
// первоклассная сущность: прикреплённый файл, формат, версия, «действует с»,
// закрепление («часто нужные») и revisedAt («недавно обновлено»).
@Injectable()
export class DocumentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly common: ContentCommonService,
    private readonly files: FilesService,
  ) {}

  async documentationTree(user: RequestUser, options: { limit?: number; depth?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const width = resolvePagination({ limit: options.limit }, { defaultLimit: 100, maxLimit: 200 }).limit;
    const rawDepth = Number.isFinite(options.depth) ? Math.trunc(options.depth!) : 3;
    const depth = Math.min(Math.max(rawDepth, 1), 3);

    const rows = (await this.prisma.documentationArticle.findMany({
      where: { parentId: null, status: ContentStatus.published },
      orderBy: { position: "asc" },
      take: width,
      include: buildDocumentationTreeInclude(depth, width),
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row, { includeChildren: true }));
  }

  // «Часто нужные» — закреплённые документы (admin их курирует). Свежезакреплённые
  // и недавно тронутые — выше.
  async pinnedDocuments(user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const rows = (await this.prisma.documentationArticle.findMany({
      where: { status: ContentStatus.published, isPinned: true },
      orderBy: { updatedAt: "desc" },
      take: PINNED_LIMIT,
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  // «Недавно обновлено» — документы (не разделы), отсортированные по дате
  // последнего существенного изменения. revisedAt у опубликованных документов
  // всегда заполнен (см. publish), поэтому сортировка стабильна.
  async recentDocuments(user: RequestUser, options: { limit?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const take = Math.min(Math.max(Math.trunc(options.limit ?? RECENT_DEFAULT_LIMIT), 1), 50);
    const rows = (await this.prisma.documentationArticle.findMany({
      where: { status: ContentStatus.published, ...DOCUMENT_LEAF_FILTER },
      orderBy: { revisedAt: "desc" },
      take,
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  async searchDocumentation(query: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const rows = (await this.prisma.documentationArticle.findMany({
      where: {
        status: ContentStatus.published,
        AND: [
          DOCUMENT_LEAF_FILTER,
          {
            OR: [
              { title: { contains: trimmed, mode: "insensitive" } },
              { subtitle: { contains: trimmed, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: 50,
      orderBy: { title: "asc" },
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  async getDocument(slug: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const row = (await this.prisma.documentationArticle.findUnique({
      where: { slug },
      include: {
        file: true,
        blocks: { orderBy: { position: "asc" } },
        parent: { include: { parent: true } },
      },
    })) as DocumentationArticleRow | null;

    if (
      !row ||
      row.status !== ContentStatus.published ||
      row.parent?.status === ContentStatus.draft ||
      row.parent?.parent?.status === ContentStatus.draft
    ) {
      throw new NotFoundException("Документ не найден.");
    }

    return mapDocumentationDetail(row);
  }

  // Свежая presigned-ссылка на приватный файл документа. Доступ — как у чтения:
  // подписка + опубликованность (платформенный персонал проходит всегда).
  async getDownloadUrl(id: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const row = await this.prisma.documentationArticle.findUnique({
      where: { id },
      include: { file: true, parent: { include: { parent: true } } },
    });

    if (!row) {
      throw new NotFoundException("Документ не найден.");
    }

    const isStaff = user.platformRoles.length > 0;
    const visible =
      row.status === ContentStatus.published &&
      row.parent?.status !== ContentStatus.draft &&
      row.parent?.parent?.status !== ContentStatus.draft;
    if (!isStaff && !visible) {
      throw new NotFoundException("Документ не найден.");
    }
    if (!row.file) {
      throw new NotFoundException("У документа нет прикреплённого файла.");
    }

    const url = await this.files.createSignedDownloadUrl(row.file);
    return { url };
  }

  async adminListDocumentation(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 100, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.documentationArticle.count(),
      this.prisma.documentationArticle.findMany({
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: { file: true, blocks: { orderBy: { position: "asc" } } },
      }),
    ]);

    const mapped = (items as DocumentationArticleRow[]).map((row) =>
      mapDocumentationNode(row, { includeBlocks: true }),
    );
    return paginatedResponse(mapped, total, pagination);
  }

  async createDocument(input: DocumentationInput, user: RequestUser) {
    const isCategory = isDocumentationCategory(input.iconType);
    const blocks = isCategory ? [] : input.blocks;
    const fileAssetId = isCategory ? null : (input.fileAssetId ?? null);
    const check = this.validateDraftableBlocks(blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    if (isCategory && (input.parentId ?? null) !== null) {
      throw new ForbiddenException("Раздел документации должен быть верхним узлом.");
    }
    await this.assertFileExists(fileAssetId);
    await assertDocumentationDepth(this.prisma, input.parentId ?? null);

    const slug =
      input.slug ??
      (await this.common.uniqueSlug(input.title, async (candidate) =>
        Boolean(await this.prisma.documentationArticle.findUnique({ where: { slug: candidate } })),
      ));

    const document = await this.prisma.documentationArticle.create({
      data: {
        parentId: input.parentId ?? null,
        title: input.title,
        subtitle: input.subtitle ?? null,
        slug,
        position: input.position,
        iconType: input.iconType,
        createdById: user.id,
        fileAssetId,
        version: isCategory ? null : (input.version ?? null),
        effectiveDate: isCategory ? null : this.parseDate(input.effectiveDate),
        isPinned: isCategory ? false : (input.isPinned ?? false),
        blocks: {
          create: blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
          })),
        },
      },
      include: { file: true, blocks: { orderBy: { position: "asc" } } },
    });

    await this.common.recordEntityReferences("documentation_article", document.id, [
      fileAssetId,
      ...blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.create",
      entityType: "DocumentationArticle",
      entityId: document.id,
    });

    return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
  }

  async updateDocument(id: string, input: DocumentationInput, user: RequestUser) {
    const existing = await this.prisma.documentationArticle.findUnique({
      where: { id },
      include: { blocks: true },
    });
    if (!existing) {
      throw new NotFoundException("Документ не найден.");
    }

    const isCategory = isDocumentationCategory(input.iconType);
    const blocks = isCategory ? [] : input.blocks;
    const fileAssetId = isCategory ? null : (input.fileAssetId ?? null);
    const check = this.validateDraftableBlocks(blocks);

    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
    if (isCategory && (input.parentId ?? existing.parentId) !== null) {
      throw new ForbiddenException("Раздел документации должен быть верхним узлом.");
    }
    if (!isCategory && existing.status === ContentStatus.published && blocks.length === 0 && !fileAssetId) {
      throw new ForbiddenException("Нельзя сохранить опубликованный документ без файла и описания.");
    }
    await this.assertFileExists(fileAssetId);

    // revisedAt («Обновлено») бампим только у опубликованного документа при смене
    // файла или явной отметке «это обновление». У черновика revisedAt проставит
    // публикация.
    const fileChanged = fileAssetId !== existing.fileAssetId;
    const shouldRevise =
      !isCategory && existing.status === ContentStatus.published && (fileChanged || input.markRevised === true);

    const previousFileIds = this.common.compactFileIds([
      existing.fileAssetId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
    ]);

    const document = await this.prisma.$transaction(async (tx) => {
      await tx.documentationBlock.deleteMany({ where: { articleId: id } });
      await tx.documentationArticle.update({
        where: { id },
        data: {
          title: input.title,
          subtitle: input.subtitle ?? null,
          iconType: input.iconType,
          fileAssetId,
          version: isCategory ? null : (input.version ?? null),
          effectiveDate: isCategory ? null : this.parseDate(input.effectiveDate),
          isPinned: isCategory ? false : (input.isPinned ?? false),
          ...(shouldRevise ? { revisedAt: new Date() } : {}),
          blocks: {
            create: blocks.map((block, position) => ({
              position,
              type: block.type,
              payload: this.common.payload(block),
            })),
          },
        },
      });
      return tx.documentationArticle.findUniqueOrThrow({
        where: { id },
        include: { file: true, blocks: { orderBy: { position: "asc" } } },
      });
    });

    await this.common.recordEntityReferences("documentation_article", id, [
      fileAssetId,
      ...blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.update",
      entityType: "DocumentationArticle",
      entityId: id,
    });

    await this.common.cleanupDetachedFiles(previousFileIds);

    return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
  }

  async publishDocument(id: string, user: RequestUser) {
    const existing = await this.prisma.documentationArticle.findUnique({
      where: { id },
      include: { _count: { select: { blocks: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Документ не найден.");
    }
    if (!isDocumentationCategory(existing.iconType) && existing._count.blocks === 0 && !existing.fileAssetId) {
      throw new ForbiddenException("Нельзя опубликовать документ без файла или описания.");
    }

    const now = new Date();
    const firstPublishedAt = existing.firstPublishedAt ?? now;
    const document = await this.prisma.documentationArticle.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt,
        revisedAt: existing.revisedAt ?? firstPublishedAt,
      },
      include: { file: true, blocks: { orderBy: { position: "asc" } } },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.publish",
      entityType: "DocumentationArticle",
      entityId: id,
    });

    return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
  }

  async unpublishDocument(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.documentationArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Документ не найден.");
    }

    const document = await this.prisma.documentationArticle.update({
      where: { id },
      data: { status: ContentStatus.draft },
      include: { file: true, blocks: { orderBy: { position: "asc" } } },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.unpublish",
      entityType: "DocumentationArticle",
      entityId: id,
      comment: reason,
    });

    return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
  }

  async moveDocument(id: string, input: { parentId: string | null; position: number }, user: RequestUser) {
    const existing = await this.prisma.documentationArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Документ не найден.");
    }

    if (input.parentId === id) {
      throw new ForbiddenException("Узел не может быть собственным родителем.");
    }
    if (isDocumentationCategory(existing.iconType) && input.parentId !== null) {
      throw new ForbiddenException("Раздел документации должен оставаться верхним узлом.");
    }

    await assertDocumentationDepth(this.prisma, input.parentId, id);

    const parentChanged = existing.parentId !== input.parentId;
    const positionChanged = existing.position !== input.position;

    const document = await this.prisma.$transaction(async (tx) => {
      if (parentChanged) {
        await tx.documentationArticle.update({
          where: { id },
          data: { position: -1_000_000 - existing.position },
        });
        await compactDocumentationAfterRemoval(tx, existing.parentId, existing.position);
        await repositionDocumentationInGroup(tx, input.parentId, id, input.position, true);
      } else if (positionChanged) {
        await repositionDocumentationInGroup(tx, input.parentId, id, input.position, false);
      }

      if (parentChanged) {
        return tx.documentationArticle.update({
          where: { id },
          data: { parentId: input.parentId },
          include: { file: true, blocks: { orderBy: { position: "asc" } } },
        });
      }
      return tx.documentationArticle.findUniqueOrThrow({
        where: { id },
        include: { file: true, blocks: { orderBy: { position: "asc" } } },
      });
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.move",
      entityType: "DocumentationArticle",
      entityId: id,
      payload: {
        from: { parentId: existing.parentId, position: existing.position },
        to: { parentId: input.parentId, position: input.position },
      },
    });

    return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
  }

  async deleteDocument(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.documentationArticle.findUnique({
      where: { id },
      include: { blocks: true, _count: { select: { children: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Документ не найден.");
    }
    if (existing._count.children > 0) {
      throw new ForbiddenException("Нельзя удалить узел с дочерними. Сначала переместите или удалите их.");
    }
    const deletedFileIds = this.common.compactFileIds([
      existing.fileAssetId,
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
    ]);

    await this.prisma.documentationArticle.delete({ where: { id } });
    await this.common.clearEntityReferences("documentation_article", id);
    await this.common.cleanupDetachedFiles(deletedFileIds);

    await this.auditLog.record({
      actorId: user.id,
      action: "documentation.delete",
      entityType: "DocumentationArticle",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, slug: existing.slug, parentId: existing.parentId },
    });

    return { ok: true };
  }

  private parseDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }

  private async assertFileExists(fileAssetId: string | null): Promise<void> {
    if (!fileAssetId) {
      return;
    }
    const file = await this.prisma.fileAsset.findUnique({ where: { id: fileAssetId }, select: { id: true } });
    if (!file) {
      throw new BadRequestException("Прикреплённый файл не найден.");
    }
  }

  private validateDraftableBlocks(blocks: DocumentationInput["blocks"]) {
    if (blocks.length === 0) {
      return { ok: true as const };
    }
    return validateContentBlocks(blocks);
  }
}

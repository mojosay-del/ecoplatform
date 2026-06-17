import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { validateContentBlocks } from "@ecoplatform/shared";
import type { z } from "zod";
import type { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { documentationArticleInputSchema } from "../content.schemas";
import type { ContentCommonService } from "./content-common.service";
import { assertDocumentationDepth, isDocumentationCategory } from "./documentation-depth.helpers";
import { compactDocumentationAfterRemoval, repositionDocumentationInGroup } from "./documentation-position.helpers";
import { mapDocumentationNode, type DocumentationArticleRow } from "./documentation-response.helpers";

type DocumentationInput = z.infer<typeof documentationArticleInputSchema>;

type DocumentationAdminWorkflowDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  common: ContentCommonService;
};

export async function createDocumentationArticle(
  { prisma, auditLog, common }: DocumentationAdminWorkflowDeps,
  input: DocumentationInput,
  user: RequestUser,
) {
  const isCategory = isDocumentationCategory(input.iconType);
  const blocks = isCategory ? [] : input.blocks;
  const fileAssetId = isCategory ? null : (input.fileAssetId ?? null);
  const displayIcon = isCategory ? (input.displayIcon ?? null) : null;
  const check = validateDraftableBlocks(blocks);

  if (!check.ok) {
    throw new ForbiddenException(check.message);
  }
  if (isCategory && (input.parentId ?? null) !== null) {
    throw new ForbiddenException("Раздел документации должен быть верхним узлом.");
  }
  await assertFileExists(prisma, fileAssetId);
  await assertDocumentationDepth(prisma, input.parentId ?? null);

  const slug =
    input.slug ??
    (await common.uniqueSlug(input.title, async (candidate) =>
      Boolean(await prisma.documentationArticle.findUnique({ where: { slug: candidate } })),
    ));

  const document = await prisma.documentationArticle.create({
    data: {
      parentId: input.parentId ?? null,
      title: input.title,
      subtitle: input.subtitle ?? null,
      slug,
      position: input.position,
      iconType: input.iconType,
      displayIcon,
      createdById: user.id,
      fileAssetId,
      version: isCategory ? null : (input.version ?? null),
      effectiveDate: isCategory ? null : parseDate(input.effectiveDate),
      isPinned: isCategory ? false : (input.isPinned ?? false),
      blocks: {
        create: blocks.map((block, position) => ({
          position,
          type: block.type,
          payload: common.payload(block),
        })),
      },
    },
    include: { file: true, blocks: { orderBy: { position: "asc" } } },
  });

  await common.recordEntityReferences("documentation_article", document.id, [
    fileAssetId,
    ...blocks.flatMap((block) => Array.from(common.collectFileIdsFromPayload(block.payload))),
  ]);

  await auditLog.record({
    actorId: user.id,
    action: "documentation.create",
    entityType: "DocumentationArticle",
    entityId: document.id,
  });

  return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
}

export async function updateDocumentationArticle(
  { prisma, auditLog, common }: DocumentationAdminWorkflowDeps,
  id: string,
  input: DocumentationInput,
  user: RequestUser,
) {
  const existing = await prisma.documentationArticle.findUnique({
    where: { id },
    include: { blocks: true },
  });
  if (!existing) {
    throw new NotFoundException("Документ не найден.");
  }

  const isCategory = isDocumentationCategory(input.iconType);
  const blocks = isCategory ? [] : input.blocks;
  const fileAssetId = isCategory ? null : (input.fileAssetId ?? null);
  const displayIcon = isCategory
    ? Object.prototype.hasOwnProperty.call(input, "displayIcon")
      ? (input.displayIcon ?? null)
      : existing.displayIcon
    : null;
  const check = validateDraftableBlocks(blocks);

  if (!check.ok) {
    throw new ForbiddenException(check.message);
  }
  if (isCategory && (input.parentId ?? existing.parentId) !== null) {
    throw new ForbiddenException("Раздел документации должен быть верхним узлом.");
  }
  if (!isCategory && existing.status === ContentStatus.published && blocks.length === 0 && !fileAssetId) {
    throw new ForbiddenException("Нельзя сохранить опубликованный документ без файла и описания.");
  }
  await assertFileExists(prisma, fileAssetId);

  // revisedAt («Обновлено») бампим только у опубликованного документа при смене
  // файла или явной отметке «это обновление». У черновика revisedAt проставит
  // публикация.
  const fileChanged = fileAssetId !== existing.fileAssetId;
  const shouldRevise =
    !isCategory && existing.status === ContentStatus.published && (fileChanged || input.markRevised === true);

  const previousFileIds = common.compactFileIds([
    existing.fileAssetId,
    ...common.collectFileIdsFromBlocks(existing.blocks),
  ]);

  const document = await prisma.$transaction(async (tx) => {
    await tx.documentationBlock.deleteMany({ where: { articleId: id } });
    await tx.documentationArticle.update({
      where: { id },
      data: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        iconType: input.iconType,
        displayIcon,
        fileAssetId,
        version: isCategory ? null : (input.version ?? null),
        effectiveDate: isCategory ? null : parseDate(input.effectiveDate),
        isPinned: isCategory ? false : (input.isPinned ?? false),
        ...(shouldRevise ? { revisedAt: new Date() } : {}),
        blocks: {
          create: blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: common.payload(block),
          })),
        },
      },
    });
    return tx.documentationArticle.findUniqueOrThrow({
      where: { id },
      include: { file: true, blocks: { orderBy: { position: "asc" } } },
    });
  });

  await common.recordEntityReferences("documentation_article", id, [
    fileAssetId,
    ...blocks.flatMap((block) => Array.from(common.collectFileIdsFromPayload(block.payload))),
  ]);

  await auditLog.record({
    actorId: user.id,
    action: "documentation.update",
    entityType: "DocumentationArticle",
    entityId: id,
  });

  await common.cleanupDetachedFiles(previousFileIds);

  return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
}

export async function publishDocumentationArticle(
  { prisma, auditLog }: DocumentationAdminWorkflowDeps,
  id: string,
  user: RequestUser,
) {
  const existing = await prisma.documentationArticle.findUnique({
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
  const document = await prisma.documentationArticle.update({
    where: { id },
    data: {
      status: ContentStatus.published,
      firstPublishedAt,
      revisedAt: existing.revisedAt ?? firstPublishedAt,
    },
    include: { file: true, blocks: { orderBy: { position: "asc" } } },
  });

  await auditLog.record({
    actorId: user.id,
    action: "documentation.publish",
    entityType: "DocumentationArticle",
    entityId: id,
  });

  return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
}

export async function unpublishDocumentationArticle(
  { prisma, auditLog }: DocumentationAdminWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.documentationArticle.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Документ не найден.");
  }

  const document = await prisma.documentationArticle.update({
    where: { id },
    data: { status: ContentStatus.draft },
    include: { file: true, blocks: { orderBy: { position: "asc" } } },
  });

  await auditLog.record({
    actorId: user.id,
    action: "documentation.unpublish",
    entityType: "DocumentationArticle",
    entityId: id,
    comment: reason,
  });

  return mapDocumentationNode(document as DocumentationArticleRow, { includeBlocks: true });
}

export async function moveDocumentationArticle(
  { prisma, auditLog }: DocumentationAdminWorkflowDeps,
  id: string,
  input: { parentId: string | null; position: number },
  user: RequestUser,
) {
  const existing = await prisma.documentationArticle.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Документ не найден.");
  }

  if (input.parentId === id) {
    throw new ForbiddenException("Узел не может быть собственным родителем.");
  }
  if (isDocumentationCategory(existing.iconType) && input.parentId !== null) {
    throw new ForbiddenException("Раздел документации должен оставаться верхним узлом.");
  }

  await assertDocumentationDepth(prisma, input.parentId, id);

  const parentChanged = existing.parentId !== input.parentId;
  const positionChanged = existing.position !== input.position;

  const document = await prisma.$transaction(async (tx) => {
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

  await auditLog.record({
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

export async function deleteDocumentationArticle(
  { prisma, auditLog, common }: DocumentationAdminWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.documentationArticle.findUnique({
    where: { id },
    include: { blocks: true, _count: { select: { children: true } } },
  });
  if (!existing) {
    throw new NotFoundException("Документ не найден.");
  }
  if (existing._count.children > 0) {
    throw new ForbiddenException("Нельзя удалить узел с дочерними. Сначала переместите или удалите их.");
  }
  const deletedFileIds = common.compactFileIds([
    existing.fileAssetId,
    ...common.collectFileIdsFromBlocks(existing.blocks),
  ]);

  await prisma.documentationArticle.delete({ where: { id } });
  await common.clearEntityReferences("documentation_article", id);
  await common.cleanupDetachedFiles(deletedFileIds);

  await auditLog.record({
    actorId: user.id,
    action: "documentation.delete",
    entityType: "DocumentationArticle",
    entityId: id,
    comment: reason,
    payload: { title: existing.title, slug: existing.slug, parentId: existing.parentId },
  });

  return { ok: true };
}

function parseDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

async function assertFileExists(prisma: PrismaService, fileAssetId: string | null): Promise<void> {
  if (!fileAssetId) {
    return;
  }
  const file = await prisma.fileAsset.findUnique({ where: { id: fileAssetId }, select: { id: true } });
  if (!file) {
    throw new BadRequestException("Прикреплённый файл не найден.");
  }
}

function validateDraftableBlocks(blocks: DocumentationInput["blocks"]) {
  if (blocks.length === 0) {
    return { ok: true as const };
  }
  return validateContentBlocks(blocks);
}

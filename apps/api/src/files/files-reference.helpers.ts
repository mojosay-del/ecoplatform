import { PrismaService } from "../prisma/prisma.service";

export type FilesReferenceDeps = {
  prisma: PrismaService;
};

export function compactFileIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export function collectFileIdsFromPayload(payload: unknown, fileIds = new Set<string>()): Set<string> {
  if (!payload || typeof payload !== "object") {
    return fileIds;
  }
  if (Array.isArray(payload)) {
    payload.forEach((value) => collectFileIdsFromPayload(value, fileIds));
    return fileIds;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.fileId === "string" && record.fileId) {
    fileIds.add(record.fileId);
  }
  Object.values(record).forEach((value) => collectFileIdsFromPayload(value, fileIds));
  return fileIds;
}

export async function replaceEntityFileReferences(
  deps: FilesReferenceDeps,
  entityType: string,
  entityId: string,
  fileIds: Array<string | null | undefined>,
): Promise<void> {
  const uniqueIds = compactFileIds(fileIds);
  // Фильтруем orphan-id: админ мог в payload ввести произвольный id,
  // которого нет в FileAsset (типичный сценарий — старый/стёртый файл
  // или хардкод в integration-тесте). FileReference имеет FK с CASCADE —
  // вставка несуществующего id даёт FK violation и 500. Тихо пропускаем.
  const existing =
    uniqueIds.length > 0
      ? await deps.prisma.fileAsset.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true },
        })
      : [];
  const validIds = new Set(existing.map((asset) => asset.id));
  const filtered = uniqueIds.filter((id) => validIds.has(id));
  await deps.prisma.$transaction(async (tx) => {
    await tx.fileReference.deleteMany({ where: { entityType, entityId } });
    if (filtered.length === 0) {
      return;
    }
    await tx.fileReference.createMany({
      data: filtered.map((fileId) => ({ fileId, entityType, entityId })),
      skipDuplicates: true,
    });
  });
}

export async function clearEntityFileReferences(
  deps: FilesReferenceDeps,
  entityType: string,
  entityId: string,
): Promise<void> {
  await deps.prisma.fileReference.deleteMany({ where: { entityType, entityId } });
}

async function shouldBackfillEntityType(deps: FilesReferenceDeps, entityType: string): Promise<boolean> {
  const existing = await deps.prisma.fileReference.count({ where: { entityType } });
  return existing === 0;
}

export async function backfillFileReferences(deps: FilesReferenceDeps): Promise<{ scanned: number }> {
  let scanned = 0;

  if (await shouldBackfillEntityType(deps, "news_post")) {
    const newsPosts = await deps.prisma.newsPost.findMany({ include: { blocks: true } });
    for (const post of newsPosts) {
      const fileIds = compactFileIds([
        post.coverImageId,
        ...post.blocks.flatMap((block) => Array.from(collectFileIdsFromPayload(block.payload))),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await replaceEntityFileReferences(deps, "news_post", post.id, fileIds);
      scanned += 1;
    }
  }

  if (await shouldBackfillEntityType(deps, "knowledge_base_article")) {
    const articles = await deps.prisma.knowledgeBaseArticle.findMany({ include: { blocks: true } });
    for (const article of articles) {
      const fileIds = compactFileIds([
        article.coverImageId,
        ...article.blocks.flatMap((block) => Array.from(collectFileIdsFromPayload(block.payload))),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await replaceEntityFileReferences(deps, "knowledge_base_article", article.id, fileIds);
      scanned += 1;
    }
  }

  if (await shouldBackfillEntityType(deps, "learning_module")) {
    const modules = await deps.prisma.learningModule.findMany({
      include: {
        chapters: {
          include: {
            lessons: {
              include: { blocks: true, attachments: true },
            },
          },
        },
      },
    });
    for (const module of modules) {
      const fileIds = compactFileIds([
        module.coverImageId,
        ...module.chapters.flatMap((chapter) =>
          chapter.lessons.flatMap((lesson) => [
            lesson.coverImageId,
            ...Array.from(
              lesson.blocks.reduce((ids, block) => collectFileIdsFromPayload(block.payload, ids), new Set<string>()),
            ),
            ...lesson.attachments.map((attachment) => attachment.fileId),
          ]),
        ),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await replaceEntityFileReferences(deps, "learning_module", module.id, fileIds);
      scanned += 1;
    }
  }

  if (await shouldBackfillEntityType(deps, "documentation_article")) {
    const documents = await deps.prisma.documentationArticle.findMany({ include: { blocks: true } });
    for (const document of documents) {
      const fileIds = compactFileIds([
        document.fileAssetId,
        ...document.blocks.flatMap((block) => Array.from(collectFileIdsFromPayload(block.payload))),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await replaceEntityFileReferences(deps, "documentation_article", document.id, fileIds);
      scanned += 1;
    }
  }

  if (await shouldBackfillEntityType(deps, "marketplace_listing")) {
    const listings = await deps.prisma.marketplaceListing.findMany({ include: { media: true } });
    for (const listing of listings) {
      const fileIds = compactFileIds(listing.media.map((item) => item.fileId));
      if (fileIds.length === 0) {
        continue;
      }
      await replaceEntityFileReferences(deps, "marketplace_listing", listing.id, fileIds);
      scanned += 1;
    }
  }

  return { scanned };
}

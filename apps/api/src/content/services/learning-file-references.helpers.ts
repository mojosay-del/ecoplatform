import type { PrismaService } from "../../prisma/prisma.service";
import type { FilesService } from "../../files/files.service";
import type { ContentCommonService } from "./content-common.service";

type LearningChapterWithAttachments = {
  lessons: Array<{ attachments: Array<{ fileId: string }> }>;
};

type LearningLessonAttachment = {
  id: string;
  fileId: string;
  displayName: string;
  position: number;
};

type LearningAttachmentMeta = {
  downloadUrl: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function resolveLearningAttachmentMeta(
  prisma: PrismaService,
  files: FilesService,
  chapters: LearningChapterWithAttachments[],
): Promise<Map<string, LearningAttachmentMeta>> {
  const fileIds = Array.from(
    new Set(
      chapters
        .flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.attachments.map((a) => a.fileId)))
        .filter(Boolean),
    ),
  );
  if (fileIds.length === 0) {
    return new Map();
  }

  const assets = await prisma.fileAsset.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, storageKey: true, accessLevel: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  const signed = await files.signDownloadUrls(assets);

  return new Map(
    assets.map((asset) => [
      asset.id,
      {
        downloadUrl: signed.get(asset.id) ?? null,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
      },
    ]),
  );
}

export function mapLessonAttachment(attachment: LearningLessonAttachment, meta?: LearningAttachmentMeta) {
  return {
    id: attachment.id,
    fileId: attachment.fileId,
    displayName: attachment.displayName,
    position: attachment.position,
    downloadUrl: meta?.downloadUrl ?? null,
    originalName: meta?.originalName ?? null,
    mimeType: meta?.mimeType ?? null,
    sizeBytes: meta?.sizeBytes ?? null,
  };
}

export async function refreshLearningModuleFileReferences(
  prisma: PrismaService,
  common: ContentCommonService,
  moduleId: string,
): Promise<void> {
  const fresh = await prisma.learningModule.findUnique({
    where: { id: moduleId },
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
  if (!fresh) return;
  await common.recordEntityReferences("learning_module", moduleId, [
    fresh.coverImageId,
    ...fresh.chapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) => [
        lesson.coverImageId,
        ...common.collectFileIdsFromBlocks(lesson.blocks),
        ...lesson.attachments.map((attachment) => attachment.fileId),
      ]),
    ),
  ]);
}

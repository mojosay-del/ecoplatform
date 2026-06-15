import { ForbiddenException } from "@nestjs/common";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { FileAsset } from "@prisma/client";
import type { RequestUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { compactFileIds } from "./files-reference.helpers";
import { parseImageVariants } from "./files-response.helpers";
import { bucketForAccessLevel, getS3Config } from "./files-storage.helpers";

export type FilesCleanupDeps = {
  prisma: PrismaService;
};

function fileStorageKeys(asset: Pick<FileAsset, "storageKey" | "variants">): string[] {
  const variants = Object.values(parseImageVariants(asset.variants)).map((variant) => variant.storageKey);
  return Array.from(new Set([asset.storageKey, ...variants]));
}

async function hasStructuredReference(prisma: PrismaService, fileId: string): Promise<boolean> {
  const counts = await Promise.all([
    prisma.newsPost.count({ where: { coverImageId: fileId } }),
    prisma.learningModule.count({ where: { coverImageId: fileId } }),
    prisma.lesson.count({ where: { coverImageId: fileId } }),
    prisma.knowledgeBaseArticle.count({ where: { coverImageId: fileId } }),
    prisma.documentationArticle.count({ where: { fileAssetId: fileId } }),
    prisma.listingMedia.count({ where: { fileId } }),
    prisma.lessonAttachment.count({ where: { fileId } }),
    prisma.commentAttachment.count({ where: { fileId } }),
    prisma.user.count({ where: { avatarFileId: fileId } }),
  ]);

  return counts.some((count) => count > 0);
}

function canDeleteAsset(asset: FileAsset, actor?: RequestUser): boolean {
  if (!actor) {
    return true;
  }

  return actor.platformRoles.includes("admin") || asset.uploadedById === actor.id;
}

async function deleteAssetObjects(asset: FileAsset): Promise<void> {
  const config = getS3Config();
  if (!config) {
    return;
  }

  // Удаляем из того же бакета, куда объект был загружен по его уровню доступа.
  const objectBucket = bucketForAccessLevel(asset.accessLevel, config.bucket);
  await Promise.all(
    fileStorageKeys(asset).map((key) =>
      config.client.send(
        new DeleteObjectCommand({
          Bucket: objectBucket,
          Key: key,
        }),
      ),
    ),
  );
}

export async function deleteUnreferencedFiles(
  deps: FilesCleanupDeps,
  fileIds: string[],
  actor?: RequestUser,
): Promise<number> {
  const uniqueIds = compactFileIds(fileIds);
  let deleted = 0;

  for (const fileId of uniqueIds) {
    const [asset, referenceCount, hasReference] = await Promise.all([
      deps.prisma.fileAsset.findUnique({ where: { id: fileId } }),
      deps.prisma.fileReference.count({ where: { fileId } }),
      hasStructuredReference(deps.prisma, fileId),
    ]);

    if (!asset || referenceCount > 0 || hasReference) {
      continue;
    }

    if (!canDeleteAsset(asset, actor)) {
      throw new ForbiddenException("Можно удалить только файл, загруженный вами.");
    }

    await deleteAssetObjects(asset);
    await deps.prisma.fileAsset.delete({ where: { id: fileId } });
    deleted += 1;
  }

  return deleted;
}

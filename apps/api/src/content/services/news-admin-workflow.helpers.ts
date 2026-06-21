import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ContentStatus, DiscussionTargetType } from "@prisma/client";
import { newsBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
import type { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { z } from "zod";
import type { newsInputSchema } from "../content.schemas";
import type { ContentCommonService } from "./content-common.service";
import { refreshTagUsage, replaceNewsTags } from "./news-tag.helpers";
import { publishedLifecycleData } from "./publish-lifecycle.helpers";

type NewsInput = z.infer<typeof newsInputSchema>;

type NewsAdminWorkflowDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  common: ContentCommonService;
};

export async function createNewsPost(
  { prisma, auditLog, common }: NewsAdminWorkflowDeps,
  input: NewsInput,
  user: RequestUser,
) {
  const check = validateContentBlocks(input.blocks, newsBlockSchema);
  if (!check.ok) {
    throw new ForbiddenException(check.message);
  }
  await common.assertCoverImageAllowed(input.coverImageId, user);

  const slug =
    input.slug ??
    (await common.uniqueSlug(input.title, async (candidate) =>
      Boolean(await prisma.newsPost.findUnique({ where: { slug: candidate } })),
    ));

  const post = await prisma.newsPost.create({
    data: {
      title: input.title,
      lead: input.lead,
      coverImageId: input.coverImageId,
      pinnedInForum: input.pinnedInForum ?? false,
      slug,
      createdById: user.id,
      blocks: {
        create: input.blocks.map((block, position) => ({
          position,
          type: block.type,
          payload: common.payload(block),
        })),
      },
    },
  });

  await replaceNewsTags(prisma, post.id, input.tags, user.id);

  // Регистрируем «новость → fileIds» в FileReference, чтобы
  // deleteIfUnreferenced работал O(1) вместо сканирования всех блоков.
  await common.recordEntityReferences("news_post", post.id, [
    input.coverImageId,
    ...input.blocks.flatMap((block) => Array.from(common.collectFileIdsFromPayload(block.payload))),
  ]);

  await auditLog.record({
    actorId: user.id,
    action: "news.create",
    entityType: "NewsPost",
    entityId: post.id,
  });

  return findAdminNews(prisma, post.id);
}

export async function updateNewsPost(
  { prisma, auditLog, common }: NewsAdminWorkflowDeps,
  id: string,
  input: NewsInput,
  user: RequestUser,
) {
  const check = validateContentBlocks(input.blocks, newsBlockSchema);
  if (!check.ok) {
    throw new ForbiddenException(check.message);
  }
  await common.assertCoverImageAllowed(input.coverImageId, user);

  const before = await prisma.newsPost.findUnique({
    where: { id },
    include: { tags: true, blocks: true },
  });
  if (!before) {
    throw new NotFoundException("Новость не найдена.");
  }
  const previousTagIds = before.tags.map((tag) => tag.newsTagId);
  const previousFileIds = common.compactFileIds([
    before.coverImageId,
    ...common.collectFileIdsFromBlocks(before.blocks),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.newsContentBlock.deleteMany({ where: { newsPostId: id } });
    await tx.newsPost.update({
      where: { id },
      data: {
        title: input.title,
        lead: input.lead,
        coverImageId: input.coverImageId,
        pinnedInForum: input.pinnedInForum ?? false,
        blocks: {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: common.payload(block),
          })),
        },
      },
    });
    await tx.newsPostTag.deleteMany({ where: { newsPostId: id } });
  });

  await replaceNewsTags(prisma, id, input.tags, user.id);
  await refreshTagUsage(prisma, previousTagIds);

  // Сначала обновляем FileReference для этой новости (новый набор файлов),
  // потом cleanupDetachedFiles — он увидит, что старый fileId больше никем
  // не упомянут, и удалит из S3.
  await common.recordEntityReferences("news_post", id, [
    input.coverImageId,
    ...input.blocks.flatMap((block) => Array.from(common.collectFileIdsFromPayload(block.payload))),
  ]);
  await common.cleanupDetachedFiles(previousFileIds);

  await auditLog.record({
    actorId: user.id,
    action: "news.update",
    entityType: "NewsPost",
    entityId: id,
  });

  return findAdminNews(prisma, id);
}

export async function publishNewsPost({ prisma, auditLog }: NewsAdminWorkflowDeps, id: string, user: RequestUser) {
  const existing = await prisma.newsPost.findUnique({
    where: { id },
    include: { _count: { select: { blocks: true } } },
  });
  if (!existing) {
    throw new NotFoundException("Новость не найдена.");
  }
  if (existing._count.blocks === 0) {
    throw new ForbiddenException("Нельзя опубликовать новость без блоков.");
  }

  const updated = await prisma.newsPost.update({
    where: { id },
    data: publishedLifecycleData(existing),
  });

  await auditLog.record({
    actorId: user.id,
    action: "news.publish",
    entityType: "NewsPost",
    entityId: id,
  });

  return updated;
}

export async function unpublishNewsPost(
  { prisma, auditLog }: NewsAdminWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.newsPost.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Новость не найдена.");
  }

  const updated = await prisma.newsPost.update({
    where: { id },
    data: { status: ContentStatus.draft },
  });

  await auditLog.record({
    actorId: user.id,
    action: "news.unpublish",
    entityType: "NewsPost",
    entityId: id,
    comment: reason,
  });

  return updated;
}

export async function deleteNewsPost(
  { prisma, auditLog, common }: NewsAdminWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.newsPost.findUnique({
    where: { id },
    include: {
      tags: true,
      blocks: true,
    },
  });
  if (!existing) {
    throw new NotFoundException("Новость не найдена.");
  }

  // Файлы комментариев берём через Discussion — у Comment больше нет прямой
  // ссылки на NewsPost.
  const commentAttachments = await prisma.commentAttachment.findMany({
    where: { comment: { discussion: { targetType: DiscussionTargetType.news_post, targetId: id } } },
    select: { fileId: true },
  });

  const affectedTagIds = existing.tags.map((tag) => tag.newsTagId);
  const deletedFileIds = common.compactFileIds([
    existing.coverImageId,
    ...common.collectFileIdsFromBlocks(existing.blocks),
    ...commentAttachments.map((attachment) => attachment.fileId),
  ]);

  // Discussion(targetType=news_post, targetId=id) удаляем явно ДО NewsPost.delete,
  // потому что прямого FK NewsPost ↔ Comment больше нет. Каскад Discussion → Comment
  // → CommentLike/CommentAttachment продолжает работать через onDelete: Cascade.
  await prisma.discussion.deleteMany({
    where: { targetType: DiscussionTargetType.news_post, targetId: id },
  });
  await prisma.newsPost.delete({ where: { id } });

  await refreshTagUsage(prisma, affectedTagIds);
  // FileReference для этой новости очищаем ДО cleanupDetachedFiles, иначе
  // ссылки бы блокировали удаление файла.
  await common.clearEntityReferences("news_post", id);
  await common.cleanupDetachedFiles(deletedFileIds);

  await auditLog.record({
    actorId: user.id,
    action: "news.delete",
    entityType: "NewsPost",
    entityId: id,
    comment: reason,
    payload: { title: existing.title, slug: existing.slug },
  });

  return { ok: true };
}

function findAdminNews(prisma: PrismaService, id: string) {
  return prisma.newsPost.findUnique({
    where: { id },
    include: { tags: { include: { newsTag: true } }, blocks: { orderBy: { position: "asc" } } },
  });
}

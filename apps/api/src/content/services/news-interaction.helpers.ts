import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, DiscussionTargetType } from "@prisma/client";
import type { PlatformSettingsService } from "../../admin/settings/platform-settings.service";
import type { ModuleAccessService } from "../../common/module-access.service";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContentCommonService } from "./content-common.service";
import { assertUserCanAccessNewsTier } from "./news-access.helpers";

type NewsInteractionDeps = {
  prisma: PrismaService;
  moduleAccess: ModuleAccessService;
  common: ContentCommonService;
  settings: PlatformSettingsService;
};

export async function toggleNewsPostLike({ prisma, common }: NewsInteractionDeps, id: string, user: RequestUser) {
  common.assertFunctionalAccess(user);
  const post = await prisma.newsPost.findUnique({
    where: { id },
    select: { id: true, status: true, accessTier: true },
  });
  if (!post || post.status !== ContentStatus.published) {
    throw new NotFoundException("Новость не найдена.");
  }
  assertUserCanAccessNewsTier(user, post.accessTier);

  const existing = await prisma.newsLike.findUnique({
    where: { userId_newsPostId: { userId: user.id, newsPostId: id } },
  });
  let liked = false;

  if (existing) {
    await prisma.newsLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.newsLike.create({ data: { userId: user.id, newsPostId: id } });
    liked = true;
  }

  const likesCount = await prisma.newsLike.count({ where: { newsPostId: id } });
  return { liked, likesCount };
}

export async function toggleNewsCommentLike(
  { prisma, moduleAccess, common }: NewsInteractionDeps,
  id: string,
  user: RequestUser,
) {
  common.assertFunctionalAccess(user);
  await moduleAccess.assertModuleAccess(user.id, "comments");

  const comment = await prisma.comment.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      discussion: { select: { targetType: true, targetId: true } },
    },
  });
  if (!comment || comment.status !== CommentStatus.published) {
    throw new NotFoundException("Комментарий не найден.");
  }
  if (comment.discussion.targetType !== DiscussionTargetType.news_post) {
    // На уроки/КБ/листинги/форум комментарии в MVP отображения нет;
    // защищаемся на уровне сервиса, чтобы не лайкнуть «невидимый» коммент.
    throw new NotFoundException("Комментарий не найден.");
  }
  const newsPost = await prisma.newsPost.findUnique({
    where: { id: comment.discussion.targetId },
    select: { status: true, accessTier: true },
  });
  if (!newsPost || newsPost.status !== ContentStatus.published) {
    throw new NotFoundException("Комментарий не найден.");
  }
  assertUserCanAccessNewsTier(user, newsPost.accessTier, "Комментарий не найден.");
  if (comment.userId === user.id) {
    throw new ForbiddenException("Нельзя поставить лайк своему комментарию.");
  }

  const existing = await prisma.commentLike.findUnique({
    where: { userId_commentId: { userId: user.id, commentId: id } },
  });
  let liked = false;

  if (existing) {
    await prisma.commentLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.commentLike.create({ data: { userId: user.id, commentId: id } });
    liked = true;
  }

  const likesCount = await prisma.commentLike.count({ where: { commentId: id } });
  return { liked, likesCount };
}

export async function addNewsComment(
  { prisma, moduleAccess, common, settings }: NewsInteractionDeps,
  newsPostId: string,
  user: RequestUser,
  input: { text: string; parentCommentId?: string },
) {
  // Глобальный стоп-кран комментариев из админки (Настройки → Сообщество).
  // Проверяем до доступа пользователя, чтобы при отключении любой запрос
  // получал понятный отказ.
  const commentsEnabled = await settings.getValue("discussions.enabled");
  if (!commentsEnabled) {
    throw new ForbiddenException("Комментирование временно отключено.");
  }
  common.assertFunctionalAccess(user);
  await moduleAccess.assertModuleAccess(user.id, "comments");

  const post = await prisma.newsPost.findUnique({
    where: { id: newsPostId },
    select: { id: true, status: true, accessTier: true },
  });
  if (!post || post.status !== ContentStatus.published) {
    throw new NotFoundException("Новость не найдена.");
  }
  assertUserCanAccessNewsTier(user, post.accessTier);

  let parentCommentId = input.parentCommentId;

  if (parentCommentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentCommentId },
      select: {
        id: true,
        parentCommentId: true,
        status: true,
        discussion: { select: { targetType: true, targetId: true } },
      },
    });
    if (
      !parent ||
      parent.status !== CommentStatus.published ||
      parent.discussion.targetType !== DiscussionTargetType.news_post ||
      parent.discussion.targetId !== newsPostId
    ) {
      throw new NotFoundException("Комментарий не найден.");
    }
    parentCommentId = parent.parentCommentId ?? parent.id;
  }

  // Discussion для этой новости создаём лениво при первом комментарии.
  // upsert — атомарно, чтобы два параллельных POST не нарвались на
  // unique(targetType, targetId).
  const discussion = await prisma.discussion.upsert({
    where: {
      targetType_targetId: {
        targetType: DiscussionTargetType.news_post,
        targetId: newsPostId,
      },
    },
    create: {
      targetType: DiscussionTargetType.news_post,
      targetId: newsPostId,
    },
    update: {},
  });

  return prisma.comment.create({
    data: {
      discussionId: discussion.id,
      userId: user.id,
      text: input.text,
      parentCommentId,
    },
  });
}

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CommentStatus, ContentStatus, DiscussionTargetType, ModerationCaseStatus, type Prisma } from "@prisma/client";
import type { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import type { AdminActionLogService } from "../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../common/pagination";
import type { RequestUser } from "../common/request-user";
import type { PrismaService } from "../prisma/prisma.service";

export type ModerationCaseDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  settings: PlatformSettingsService;
};

const moderationCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

export type ModerationCaseWithRelations = Prisma.ModerationCaseGetPayload<{ include: typeof moderationCaseInclude }>;

type ResolvedEntitySummary =
  | {
      type: "news_comment";
      id: string;
      text: string;
      status: CommentStatus;
      createdAt: Date;
      newsPost: { id: string; title: string; slug: string };
    }
  | { type: "news_post"; id: string; title: string; slug: string; status: ContentStatus }
  | { type: "knowledge_article"; id: string; title: string; slug: string; status: ContentStatus };

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: { id: string; organizationName: string } | null;
};

export async function listCases(deps: ModerationCaseDeps, paginationInput: PaginationInput = {}) {
  const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 100 });
  const [total, cases] = await deps.prisma.$transaction([
    deps.prisma.moderationCase.count(),
    deps.prisma.moderationCase.findMany({
      orderBy: { createdAt: "asc" },
      include: moderationCaseInclude,
      take: pagination.limit,
      skip: pagination.offset,
    }),
  ]);

  return paginatedResponse(await enrichCases(deps, cases), total, pagination);
}

export async function getCase(deps: ModerationCaseDeps, id: string) {
  const found = await deps.prisma.moderationCase.findUnique({
    where: { id },
    include: moderationCaseInclude,
  });

  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }

  return (await enrichCases(deps, [found]))[0];
}

export async function takeCaseLock(deps: ModerationCaseDeps, id: string, user: RequestUser) {
  const found = await deps.prisma.moderationCase.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }
  if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
    throw new BadRequestException("Закрытый кейс нельзя взять в работу.");
  }

  const now = new Date();
  if (found.lockedById && found.lockedById !== user.id && found.lockedUntil && found.lockedUntil > now) {
    throw new ConflictException("Кейс уже находится в работе у другого сотрудника.");
  }

  const maxLocks = await deps.settings.getValue("moderation.max_locks_per_moderator");
  const lockDurationMs = (await deps.settings.getValue("moderation.lock_duration_minutes")) * 60 * 1000;

  if (!isAdmin(user)) {
    const activeLocks = await deps.prisma.moderationCase.count({
      where: {
        lockedById: user.id,
        lockedUntil: { gt: now },
        status: ModerationCaseStatus.in_review,
        NOT: { id },
      },
    });

    if (activeLocks >= maxLocks) {
      throw new ConflictException(`Модератор может держать в работе не более ${maxLocks} кейсов.`);
    }
  }

  const locked = await deps.prisma.moderationCase.update({
    where: { id },
    data: {
      status: found.status === ModerationCaseStatus.open ? ModerationCaseStatus.in_review : found.status,
      lockedById: user.id,
      lockedUntil: new Date(now.getTime() + lockDurationMs),
    },
    include: moderationCaseInclude,
  });

  await deps.auditLog.record({
    actorId: user.id,
    action: "moderation.case.lock",
    entityType: "ModerationCase",
    entityId: id,
    payload: { lockedUntil: locked.lockedUntil?.toISOString() },
  });

  return (await enrichCases(deps, [locked]))[0];
}

export async function releaseCaseLock(deps: ModerationCaseDeps, id: string, user: RequestUser) {
  const found = await deps.prisma.moderationCase.findUnique({ where: { id } });
  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }
  if (found.lockedById && found.lockedById !== user.id && !isAdmin(user)) {
    throw new ForbiddenException("Освободить чужой lock может только администратор.");
  }

  const updated = await deps.prisma.moderationCase.update({
    where: { id },
    data: {
      lockedById: null,
      lockedUntil: null,
      status: found.status === ModerationCaseStatus.in_review ? ModerationCaseStatus.open : found.status,
    },
    include: moderationCaseInclude,
  });

  await deps.auditLog.record({
    actorId: user.id,
    action: "moderation.case.release",
    entityType: "ModerationCase",
    entityId: id,
  });

  return (await enrichCases(deps, [updated]))[0];
}

export async function enrichCases(deps: ModerationCaseDeps, cases: ModerationCaseWithRelations[]) {
  if (cases.length === 0) return [];

  const commentIds = cases.filter((item) => item.entityType === "news_comment").map((item) => item.entityId);
  const newsPostIds = cases.filter((item) => item.entityType === "news_post").map((item) => item.entityId);
  const articleIds = cases.filter((item) => item.entityType === "knowledge_article").map((item) => item.entityId);

  const [commentsRaw, newsPosts, articles] = await Promise.all([
    deps.prisma.comment.findMany({
      where: { id: { in: commentIds } },
      include: { discussion: { select: { targetType: true, targetId: true } } },
    }),
    deps.prisma.newsPost.findMany({
      where: { id: { in: newsPostIds } },
      select: { id: true, title: true, slug: true, status: true },
    }),
    deps.prisma.knowledgeBaseArticle.findMany({
      where: { id: { in: articleIds } },
      select: { id: true, title: true, slug: true, status: true },
    }),
  ]);

  // Подмешиваем NewsPost к Comment через Discussion. Раньше это было прямой
  // join (Comment.newsPost), сейчас — отдельный батч-запрос по targetId.
  const commentNewsPostIds = commentsRaw
    .filter((c) => c.discussion.targetType === DiscussionTargetType.news_post)
    .map((c) => c.discussion.targetId);
  const commentNewsPosts =
    commentNewsPostIds.length > 0
      ? await deps.prisma.newsPost.findMany({
          where: { id: { in: commentNewsPostIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
  const commentNewsPostMap = new Map(commentNewsPosts.map((post) => [post.id, post]));
  const comments = commentsRaw
    .map((comment) => {
      const post =
        comment.discussion.targetType === DiscussionTargetType.news_post
          ? commentNewsPostMap.get(comment.discussion.targetId)
          : null;
      if (!post) return null;
      return {
        id: comment.id,
        text: comment.text,
        status: comment.status,
        createdAt: comment.createdAt,
        newsPost: post,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
  const newsPostMap = new Map(newsPosts.map((item) => [item.id, item]));
  const articleMap = new Map(articles.map((item) => [item.id, item]));

  const userIds = [
    ...cases.flatMap((item) => [
      item.entityAuthorId,
      item.lockedById,
      ...item.complaints.map((complaint) => complaint.authorId),
      ...item.decisions.map((decision) => decision.actorId),
    ]),
  ].filter(Boolean) as string[];
  const users = await deps.prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: { select: { id: true, organizationName: true } },
    },
  });
  const userMap = new Map<string, UserSummary>(users.map((item) => [item.id, item]));

  return cases.map((item) => {
    const entity = buildEntitySummary(item, commentMap, newsPostMap, articleMap);
    return {
      ...item,
      lockedBy: item.lockedById ? (userMap.get(item.lockedById) ?? null) : null,
      entity:
        entity && entity.type === "news_comment"
          ? { ...entity, author: item.entityAuthorId ? (userMap.get(item.entityAuthorId) ?? null) : null }
          : entity,
      complaints: item.complaints.map((complaint) => ({
        ...complaint,
        author: userMap.get(complaint.authorId) ?? null,
      })),
      decisions: item.decisions.map((decision) => ({
        ...decision,
        actor: userMap.get(decision.actorId) ?? null,
      })),
    };
  });
}

function buildEntitySummary(
  item: ModerationCaseWithRelations,
  commentMap: Map<
    string,
    {
      id: string;
      text: string;
      status: CommentStatus;
      createdAt: Date;
      newsPost: { id: string; title: string; slug: string };
    }
  >,
  newsPostMap: Map<string, { id: string; title: string; slug: string; status: ContentStatus }>,
  articleMap: Map<string, { id: string; title: string; slug: string; status: ContentStatus }>,
): ResolvedEntitySummary | null {
  if (item.entityType === "news_comment") {
    const found = commentMap.get(item.entityId);
    if (!found) return null;
    return {
      type: "news_comment",
      id: found.id,
      text: found.text,
      status: found.status,
      createdAt: found.createdAt,
      newsPost: found.newsPost,
    };
  }
  if (item.entityType === "news_post") {
    const found = newsPostMap.get(item.entityId);
    if (!found) return null;
    return { type: "news_post", id: found.id, title: found.title, slug: found.slug, status: found.status };
  }
  if (item.entityType === "knowledge_article") {
    const found = articleMap.get(item.entityId);
    if (!found) return null;
    return {
      type: "knowledge_article",
      id: found.id,
      title: found.title,
      slug: found.slug,
      status: found.status,
    };
  }
  return null;
}

function isAdmin(user: RequestUser) {
  return user.platformRoles.includes("admin");
}

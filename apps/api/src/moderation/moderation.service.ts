import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CommentStatus,
  ComplaintStatus,
  ContentStatus,
  ModerationCaseStatus,
  ModerationDecisionType,
  NotificationCategory,
  SanctionType,
  type Prisma,
} from "@prisma/client";
import { canOpenFunctionalSections } from "@ecoplatform/shared";
import { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { complaintInputSchema, moderationDecisionInputSchema } from "./moderation.schemas";
import type { z } from "zod";

const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_MODERATOR_LOCKS = 3;
const MODERATED_ENTITY_TYPE = "news_comment";
const ACTIVE_CASE_STATUSES = [ModerationCaseStatus.open, ModerationCaseStatus.in_review, ModerationCaseStatus.escalated];

const moderationCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

type ComplaintInput = z.infer<typeof complaintInputSchema>;
type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;
type ModerationCaseWithRelations = Prisma.ModerationCaseGetPayload<{ include: typeof moderationCaseInclude }>;

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: { id: string; organizationName: string } | null;
};

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async createComplaint(input: ComplaintInput, user: RequestUser) {
    this.assertFunctionalAccess(user);

    const existing = await this.prisma.complaint.findUnique({
      where: {
        entityType_entityId_authorId_reasonCode: {
          entityType: input.entityType,
          entityId: input.entityId,
          authorId: user.id,
          reasonCode: input.reasonCode,
        },
      },
    });

    if (existing) {
      return { complaint: existing, duplicate: true };
    }

    const entity = await this.getPublishedNewsComment(input.entityId);

    const complaint = await this.prisma.$transaction(async (tx) => {
      const activeCase =
        (await tx.moderationCase.findFirst({
          where: {
            entityType: input.entityType,
            entityId: input.entityId,
            status: { in: ACTIVE_CASE_STATUSES },
          },
          orderBy: { createdAt: "desc" },
        })) ??
        (await tx.moderationCase.create({
          data: {
            type: "complaint",
            entityType: input.entityType,
            entityId: input.entityId,
            entityAuthorId: entity.userId,
            entityCompanyId: entity.user.companyId,
          },
        }));

      return tx.complaint.create({
        data: {
          caseId: activeCase.id,
          entityType: input.entityType,
          entityId: input.entityId,
          authorId: user.id,
          authorCompanyId: user.companyId,
          reasonCode: input.reasonCode,
          comment: input.comment,
        },
      });
    });

    return { complaint, duplicate: false };
  }

  async listCases() {
    const cases = await this.prisma.moderationCase.findMany({
      orderBy: { createdAt: "asc" },
      include: moderationCaseInclude,
      take: 100,
    });

    return this.enrichCases(cases);
  }

  async getCase(id: string) {
    const found = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: moderationCaseInclude,
    });

    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }

    return (await this.enrichCases([found]))[0];
  }

  async takeCaseLock(id: string, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({ where: { id } });
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

    if (!this.isAdmin(user)) {
      const activeLocks = await this.prisma.moderationCase.count({
        where: {
          lockedById: user.id,
          lockedUntil: { gt: now },
          status: ModerationCaseStatus.in_review,
          NOT: { id },
        },
      });

      if (activeLocks >= MAX_MODERATOR_LOCKS) {
        throw new ConflictException("Модератор может держать в работе не более трёх кейсов.");
      }
    }

    const locked = await this.prisma.moderationCase.update({
      where: { id },
      data: {
        status: found.status === ModerationCaseStatus.open ? ModerationCaseStatus.in_review : found.status,
        lockedById: user.id,
        lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      },
      include: moderationCaseInclude,
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "moderation.case.lock",
      entityType: "ModerationCase",
      entityId: id,
      payload: { lockedUntil: locked.lockedUntil?.toISOString() },
    });

    return (await this.enrichCases([locked]))[0];
  }

  async releaseCaseLock(id: string, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }
    if (found.lockedById && found.lockedById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException("Освободить чужой lock может только администратор.");
    }

    const updated = await this.prisma.moderationCase.update({
      where: { id },
      data: {
        lockedById: null,
        lockedUntil: null,
        status: found.status === ModerationCaseStatus.in_review ? ModerationCaseStatus.open : found.status,
      },
      include: moderationCaseInclude,
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "moderation.case.release",
      entityType: "ModerationCase",
      entityId: id,
    });

    return (await this.enrichCases([updated]))[0];
  }

  async createDecision(id: string, input: ModerationDecisionInput, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: moderationCaseInclude,
    });
    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }
    if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
      throw new BadRequestException("По закрытому кейсу нельзя вынести новое решение.");
    }
    if (found.status === ModerationCaseStatus.escalated && !this.isAdmin(user)) {
      throw new ForbiddenException("Эскалированный кейс решает администратор.");
    }

    const now = new Date();
    if (!this.isAdmin(user) && (found.lockedById !== user.id || !found.lockedUntil || found.lockedUntil <= now)) {
      throw new ForbiddenException("Перед решением модератор должен взять кейс в работу.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const decision = await tx.moderationDecision.create({
        data: {
          caseId: found.id,
          actorId: user.id,
          actorRole: this.isAdmin(user) ? "admin" : "moderator",
          type: input.type,
          reasonCode: input.reasonCode,
          comment: input.comment,
        },
      });

      if (input.type === ModerationDecisionType.remove_content) {
        await this.removeModeratedEntity(tx, found);
        await tx.sanction.create({
          data: {
            caseId: found.id,
            decisionId: decision.id,
            type: SanctionType.content_removal,
            targetType: found.entityType,
            targetId: found.entityId,
            appliedById: user.id,
            parameters: { reasonCode: input.reasonCode, comment: input.comment },
          },
        });
      }

      if (input.type === ModerationDecisionType.warn_company) {
        if (!found.entityCompanyId) {
          throw new BadRequestException("У автора сущности нет компании для предупреждения.");
        }
        await tx.sanction.create({
          data: {
            caseId: found.id,
            decisionId: decision.id,
            type: SanctionType.warning,
            targetType: "company",
            targetId: found.entityCompanyId,
            appliedById: user.id,
            parameters: { reasonCode: input.reasonCode, comment: input.comment },
          },
        });
      }

      const nextStatus =
        input.type === ModerationDecisionType.escalate_to_admin
          ? ModerationCaseStatus.escalated
          : ModerationCaseStatus.resolved;

      await tx.complaint.updateMany({
        where: { caseId: found.id },
        data: { status: nextStatus === ModerationCaseStatus.resolved ? ComplaintStatus.resolved : ComplaintStatus.pending },
      });

      const updatedCase = await tx.moderationCase.update({
        where: { id: found.id },
        data: {
          status: nextStatus,
          lockedById: null,
          lockedUntil: null,
          closedAt: nextStatus === ModerationCaseStatus.resolved ? new Date() : null,
        },
        include: moderationCaseInclude,
      });

      return { decision, updatedCase };
    });

    await this.auditLog.record({
      actorId: user.id,
      action: `moderation.case.${input.type}`,
      entityType: "ModerationCase",
      entityId: found.id,
      comment: input.comment,
      payload: { reasonCode: input.reasonCode, entityType: found.entityType, entityId: found.entityId },
    });

    await this.notifyDecision(result.updatedCase, result.decision).catch(() => undefined);

    return (await this.enrichCases([result.updatedCase]))[0];
  }

  private assertFunctionalAccess(user: RequestUser) {
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к разделу ограничен. Активируйте подписку в кабинете.");
    }
  }

  private async getPublishedNewsComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        newsPost: { select: { id: true, title: true, slug: true, status: true } },
        user: { select: { id: true, companyId: true } },
      },
    });

    if (!comment || comment.status !== CommentStatus.published || comment.newsPost.status !== ContentStatus.published) {
      throw new NotFoundException("Комментарий не найден или недоступен для жалобы.");
    }

    return comment;
  }

  private async removeModeratedEntity(tx: Prisma.TransactionClient, found: ModerationCaseWithRelations) {
    if (found.entityType !== MODERATED_ENTITY_TYPE) {
      throw new BadRequestException("В MVP поддерживаются только комментарии к новостям.");
    }

    await tx.comment.update({
      where: { id: found.entityId },
      data: { status: CommentStatus.hidden_by_moderator },
    });
  }

  private async notifyDecision(
    found: ModerationCaseWithRelations,
    decision: { id: string; type: ModerationDecisionType; reasonCode: string },
  ) {
    if (decision.type === ModerationDecisionType.escalate_to_admin) return;

    const entity = await this.getModerationEntity(found);
    const complaintAuthors = [...new Set(found.complaints.map((complaint) => complaint.authorId))];

    await Promise.all(
      complaintAuthors.map((userId) =>
        this.notifications.createInApp({
          userId,
          eventType: "moderation.complaint.resolved",
          sourceId: `${decision.id}:${userId}`,
          category: NotificationCategory.moderation,
          title: "Жалоба рассмотрена",
          body: `Жалоба по комментарию к новости «${entity?.newsPost.title ?? "Новость"}» рассмотрена.`,
          link: entity?.newsPost.slug ? `/news/${entity.newsPost.slug}` : "/news",
          payload: { caseId: found.id, decisionId: decision.id, reasonCode: decision.reasonCode },
        }),
      ),
    );

    if (decision.type === ModerationDecisionType.remove_content && found.entityAuthorId) {
      await this.notifications.createInApp({
        userId: found.entityAuthorId,
        eventType: "moderation.content.removed",
        sourceId: decision.id,
        category: NotificationCategory.moderation,
        title: "Комментарий снят модератором",
        body: `Ваш комментарий к новости «${entity?.newsPost.title ?? "Новость"}» скрыт по итогам модерации.`,
        link: entity?.newsPost.slug ? `/news/${entity.newsPost.slug}` : "/news",
        payload: { caseId: found.id, decisionId: decision.id },
      });
    }

    if (decision.type === ModerationDecisionType.warn_company && found.entityAuthorId) {
      await this.notifications.createInApp({
        userId: found.entityAuthorId,
        eventType: "moderation.warning.issued",
        sourceId: decision.id,
        category: NotificationCategory.moderation,
        title: "Предупреждение от модератора",
        body: `По комментарию к новости «${entity?.newsPost.title ?? "Новость"}» вынесено предупреждение компании.`,
        link: "/notifications",
        payload: { caseId: found.id, decisionId: decision.id },
      });
    }
  }

  private async enrichCases(cases: ModerationCaseWithRelations[]) {
    if (cases.length === 0) return [];

    const entityIds = cases.filter((item) => item.entityType === MODERATED_ENTITY_TYPE).map((item) => item.entityId);
    const comments = await this.prisma.comment.findMany({
      where: { id: { in: entityIds } },
      include: {
        newsPost: { select: { id: true, title: true, slug: true } },
      },
    });
    const commentMap = new Map(comments.map((comment) => [comment.id, comment]));

    const userIds = [
      ...cases.flatMap((item) => [
        item.entityAuthorId,
        item.lockedById,
        ...item.complaints.map((complaint) => complaint.authorId),
        ...item.decisions.map((decision) => decision.actorId),
      ]),
    ].filter(Boolean) as string[];
    const users = await this.prisma.user.findMany({
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
      const entity = commentMap.get(item.entityId);
      return {
        ...item,
        lockedBy: item.lockedById ? userMap.get(item.lockedById) ?? null : null,
        entity:
          item.entityType === MODERATED_ENTITY_TYPE && entity
            ? {
                type: MODERATED_ENTITY_TYPE,
                id: entity.id,
                text: entity.text,
                status: entity.status,
                createdAt: entity.createdAt,
                newsPost: entity.newsPost,
                author: item.entityAuthorId ? userMap.get(item.entityAuthorId) ?? null : null,
              }
            : null,
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

  private async getModerationEntity(found: ModerationCaseWithRelations) {
    if (found.entityType !== MODERATED_ENTITY_TYPE) return null;
    return this.prisma.comment.findUnique({
      where: { id: found.entityId },
      include: { newsPost: { select: { id: true, title: true, slug: true } } },
    });
  }

  private isAdmin(user: RequestUser) {
    return user.platformRoles.includes("admin");
  }
}

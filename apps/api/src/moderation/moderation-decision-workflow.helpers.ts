import { BadRequestException } from "@nestjs/common";
import {
  ComplaintStatus,
  ModerationCaseStatus,
  ModerationDecisionType,
  SanctionType,
  type Prisma,
} from "@prisma/client";
import type { z } from "zod";
import { isPlatformAdmin } from "../common/access-policy";
import type { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { moderationDecisionInputSchema } from "./moderation.schemas";
import { removeModeratedEntity } from "./moderation-decision-removal.helpers";

type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;

export type ModerationDecisionDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  notifications: NotificationsService;
};

export const moderationDecisionCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

export type ModerationDecisionCaseWithRelations = Prisma.ModerationCaseGetPayload<{
  include: typeof moderationDecisionCaseInclude;
}>;

export type ModerationDecisionNotificationRecord = {
  id: string;
  type: ModerationDecisionType;
  reasonCode: string;
};

export async function createDecisionTransaction(
  deps: ModerationDecisionDeps,
  found: ModerationDecisionCaseWithRelations,
  input: ModerationDecisionInput,
  user: RequestUser,
): Promise<{
  decision: ModerationDecisionNotificationRecord;
  updatedCase: ModerationDecisionCaseWithRelations;
}> {
  return deps.prisma.$transaction(async (tx) => {
    const decision = await tx.moderationDecision.create({
      data: {
        caseId: found.id,
        actorId: user.id,
        actorRole: isPlatformAdmin(user) ? "admin" : "moderator",
        type: input.type,
        reasonCode: input.reasonCode,
        comment: input.comment,
      },
    });

    if (input.type === ModerationDecisionType.remove_content) {
      await removeModeratedEntity(tx, found);
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
      data: {
        status: nextStatus === ModerationCaseStatus.resolved ? ComplaintStatus.resolved : ComplaintStatus.pending,
      },
    });

    const updatedCase = await tx.moderationCase.update({
      where: { id: found.id },
      data: {
        status: nextStatus,
        lockedById: null,
        lockedUntil: null,
        closedAt: nextStatus === ModerationCaseStatus.resolved ? new Date() : null,
      },
      include: moderationDecisionCaseInclude,
    });

    return { decision, updatedCase };
  });
}

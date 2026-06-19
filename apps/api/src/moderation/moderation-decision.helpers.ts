import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ModerationCaseStatus } from "@prisma/client";
import type { z } from "zod";
import { isPlatformAdmin } from "../common/access-policy";
import type { RequestUser } from "../common/request-user";
import { swallowAndLog } from "../common/silent-catch";
import type { moderationDecisionInputSchema } from "./moderation.schemas";
import {
  createDecisionTransaction,
  moderationDecisionCaseInclude,
  type ModerationDecisionCaseWithRelations,
  type ModerationDecisionDeps,
} from "./moderation-decision-workflow.helpers";
import { notifyDecision } from "./moderation-decision-notify.helpers";

type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;

export type { ModerationDecisionCaseWithRelations, ModerationDecisionDeps };

export async function createDecision(
  deps: ModerationDecisionDeps,
  id: string,
  input: ModerationDecisionInput,
  user: RequestUser,
): Promise<ModerationDecisionCaseWithRelations> {
  const found = await deps.prisma.moderationCase.findUnique({
    where: { id },
    include: moderationDecisionCaseInclude,
  });
  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }
  if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
    throw new BadRequestException("По закрытому кейсу нельзя вынести новое решение.");
  }
  if (found.status === ModerationCaseStatus.escalated && !isPlatformAdmin(user)) {
    throw new ForbiddenException("Эскалированный кейс решает администратор.");
  }

  const now = new Date();
  if (!isPlatformAdmin(user) && (found.lockedById !== user.id || !found.lockedUntil || found.lockedUntil <= now)) {
    throw new ForbiddenException("Перед решением модератор должен взять кейс в работу.");
  }

  const result = await createDecisionTransaction(deps, found, input, user);

  await deps.auditLog.record({
    actorId: user.id,
    action: `moderation.case.${input.type}`,
    entityType: "ModerationCase",
    entityId: found.id,
    comment: input.comment,
    payload: { reasonCode: input.reasonCode, entityType: found.entityType, entityId: found.entityId },
  });

  await notifyDecision(deps, result.updatedCase, result.decision).catch(
    swallowAndLog("moderation.decision.notify", { caseId: result.updatedCase.id }),
  );

  return result.updatedCase;
}

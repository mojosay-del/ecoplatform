import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CompanyStatus, Prisma } from "@prisma/client";
import { computeDiff } from "../common/admin-action-log.service";
import type { PrismaService } from "../prisma/prisma.service";
import {
  addHours,
  isCompanySubscriptionCurrentlyActive,
  isUniqueConstraintError,
  replayStoredResponse,
  serializeCompany,
  type TrialActivationResponse,
} from "./billing-subscription.helpers";

const SELF_TRIAL_ENDPOINT = "POST /api/billing/trial";
const SELF_TRIAL_ACTION = "self_trial_activation";

export async function createSelfTrialActivation(
  prisma: PrismaService,
  actorId: string,
  companyId: string,
  key: string,
  requestHash: string,
  durationHours: number,
): Promise<TrialActivationResponse> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: { key_endpoint_actorId: { key, endpoint: SELF_TRIAL_ENDPOINT, actorId } },
  });
  if (existing) {
    return replayStoredResponse<TrialActivationResponse>(existing, requestHash);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key,
          endpoint: SELF_TRIAL_ENDPOINT,
          action: SELF_TRIAL_ACTION,
          actorId,
          requestHash,
        },
      });

      const company = await tx.company.findUnique({ where: { id: companyId } });
      if (!company) {
        throw new NotFoundException("Компания не найдена.");
      }

      if (company.status === CompanyStatus.suspended || company.status === CompanyStatus.pending_deletion) {
        throw new ForbiddenException("Для этой компании пробный доступ временно недоступен.");
      }

      if (company.demoEndsAt) {
        throw new ConflictException("Пробный доступ уже использован. Выберите подписку.");
      }

      if (company.subscriptionPlan || isCompanySubscriptionCurrentlyActive(company)) {
        throw new ConflictException("Пробный доступ доступен только до выбора подписки.");
      }

      const trialStartsAt = new Date();
      const trialEndsAt = addHours(trialStartsAt, durationHours);
      const updatedCompany = await tx.company.update({
        where: { id: companyId },
        data: {
          status: CompanyStatus.demo,
          statusBeforeDeletion: null,
          demoEndsAt: trialEndsAt,
        },
      });

      const before = {
        status: company.status,
        demoEndsAt: null,
        subscriptionPlan: company.subscriptionPlan,
        subscriptionEndsAt: company.subscriptionEndsAt?.toISOString() ?? null,
      };
      const after = {
        status: updatedCompany.status,
        demoEndsAt: updatedCompany.demoEndsAt?.toISOString() ?? null,
        subscriptionPlan: updatedCompany.subscriptionPlan,
        subscriptionEndsAt: updatedCompany.subscriptionEndsAt?.toISOString() ?? null,
      };
      const auditPayload: Record<string, unknown> = {
        before,
        after,
        diff: computeDiff(before, after),
        source: "subscription_page",
        durationHours,
      };

      await tx.adminActionLog.create({
        data: {
          actorId,
          action: SELF_TRIAL_ACTION,
          entityType: "Company",
          entityId: companyId,
          comment: "Пользователь включил пробный доступ на странице выбора тарифа.",
          payload: auditPayload as Prisma.InputJsonValue,
        },
      });

      const response = {
        company: serializeCompany(updatedCompany),
        trialEndsAt: trialEndsAt.toISOString(),
      };

      await tx.idempotencyKey.update({
        where: { key_endpoint_actorId: { key, endpoint: SELF_TRIAL_ENDPOINT, actorId } },
        data: {
          response: response as unknown as Prisma.InputJsonValue,
          referenceType: "Company",
          referenceId: companyId,
        },
      });

      return response;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key_endpoint_actorId: { key, endpoint: SELF_TRIAL_ENDPOINT, actorId } },
      });
      if (existing) {
        return replayStoredResponse<TrialActivationResponse>(existing, requestHash);
      }
    }

    throw error;
  }
}

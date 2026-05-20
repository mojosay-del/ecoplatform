import { Injectable, NotFoundException } from "@nestjs/common";
import { CompanyStatus, SubscriptionStatus } from "@prisma/client";
import type { ManualSubscriptionDto } from "@ecoplatform/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    return company;
  }

  async listCompanies() {
    return this.prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      include: { users: true, subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  }

  async activateManually(input: ManualSubscriptionDto, actorId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          companyId: input.companyId,
          plan: input.plan,
          status: SubscriptionStatus.active,
          startsAt: new Date(),
          endsAt: new Date(input.endsAt),
          reason: input.reason,
        },
      });

      const updatedCompany = await tx.company.update({
        where: { id: input.companyId },
        data: {
          status: CompanyStatus.active,
          subscriptionPlan: input.plan,
          subscriptionEndsAt: new Date(input.endsAt),
        },
      });

      await tx.adminActionLog.create({
        data: {
          actorId,
          action: "manual_subscription_activation",
          entityType: "Company",
          entityId: input.companyId,
          comment: input.reason,
          payload: { plan: input.plan, endsAt: input.endsAt },
        },
      });

      return { company: updatedCompany, subscription };
    });
  }
}

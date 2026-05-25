import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CompanyStatus, Prisma, SubscriptionPlan } from "@prisma/client";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import type { adminCompanyListQuerySchema, adminCompanyStatusInputSchema } from "./admin-companies.schemas";
import type { z } from "zod";

type ListQuery = z.infer<typeof adminCompanyListQuerySchema>;
type StatusInput = z.infer<typeof adminCompanyStatusInputSchema>;

@Injectable()
export class AdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  async listCompanies(query: ListQuery) {
    const where: Prisma.CompanyWhereInput = {};
    if (query.status) {
      where.status = query.status as CompanyStatus;
    }
    if (query.plan) {
      where.subscriptionPlan = query.plan as SubscriptionPlan;
    }
    if (query.search) {
      const term = query.search;
      where.OR = [{ organizationName: { contains: term, mode: "insensitive" } }, { billingInn: { contains: term } }];
    }

    const [total, items] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.take,
        take: query.take,
        select: {
          id: true,
          organizationName: true,
          status: true,
          subscriptionPlan: true,
          subscriptionEndsAt: true,
          demoEndsAt: true,
          createdAt: true,
          _count: { select: { users: true, subscriptions: true, supportTickets: true } },
        },
      }),
    ]);

    return { total, page: query.page, take: query.take, items };
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        subscriptions: {
          orderBy: { startsAt: "desc" },
          take: 20,
        },
        supportTickets: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            category: true,
            subject: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }

    return company;
  }

  async changeStatus(id: string, input: StatusInput, actor: RequestUser) {
    const company = await this.prisma.company.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!company) {
      throw new NotFoundException("Компания не найдена.");
    }
    if (company.status === input.status) {
      throw new BadRequestException("Компания уже в этом статусе.");
    }

    const nextStatus = input.status as CompanyStatus;

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id }, data: { status: nextStatus } });

      if (nextStatus === CompanyStatus.blocked || nextStatus === CompanyStatus.archived) {
        await tx.session.updateMany({
          where: { user: { companyId: id }, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.company.status",
      entityType: "Company",
      entityId: id,
      comment: input.comment,
      payload: { from: company.status, to: nextStatus, reasonCode: input.reasonCode },
    });

    return this.getCompany(id);
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserStatus } from "@prisma/client";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  adminUserBlockInputSchema,
  adminUserListQuerySchema,
  adminUserPlatformRolesInputSchema,
  adminUserUnblockInputSchema,
} from "./admin-users.schemas";
import type { z } from "zod";

type ListQuery = z.infer<typeof adminUserListQuerySchema>;
type BlockInput = z.infer<typeof adminUserBlockInputSchema>;
type UnblockInput = z.infer<typeof adminUserUnblockInputSchema>;
type PlatformRolesInput = z.infer<typeof adminUserPlatformRolesInputSchema>;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  async listUsers(query: ListQuery) {
    const where: Prisma.UserWhereInput = {};
    if (query.status) {
      where.status = query.status === "blocked" ? UserStatus.blocked : UserStatus.active;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.search) {
      const term = query.search;
      where.OR = [
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.take,
        take: query.take,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          company: { select: { id: true, organizationName: true, status: true } },
          platformStaff: { select: { roles: true, isActive: true } },
        },
      }),
    ]);

    return { total, page: query.page, take: query.take, items };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, organizationName: true, status: true, subscriptionPlan: true } },
        platformStaff: { select: { roles: true, isActive: true } },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }

    const [activeRestrictions, recentSessions] = await Promise.all([
      this.prisma.userModuleRestriction.findMany({
        where: { userId: id, liftedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "desc" },
      }),
      this.prisma.session.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
      }),
    ]);

    return { ...user, activeRestrictions, recentSessions };
  }

  async blockUser(id: string, input: BlockInput, actor: RequestUser) {
    if (id === actor.id) {
      throw new BadRequestException("Нельзя заблокировать собственную учётную запись.");
    }

    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }
    if (user.status === UserStatus.blocked) {
      throw new BadRequestException("Пользователь уже заблокирован.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: UserStatus.blocked } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.user.block",
      entityType: "User",
      entityId: id,
      comment: input.comment,
      payload: { reasonCode: input.reasonCode },
    });

    return this.getUser(id);
  }

  async unblockUser(id: string, input: UnblockInput, actor: RequestUser) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }
    if (user.status !== UserStatus.blocked) {
      throw new BadRequestException("Пользователь не заблокирован.");
    }

    await this.prisma.user.update({ where: { id }, data: { status: UserStatus.active } });

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.user.unblock",
      entityType: "User",
      entityId: id,
      comment: input.comment,
    });

    return this.getUser(id);
  }

  async updatePlatformRoles(id: string, input: PlatformRolesInput, actor: RequestUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { platformStaff: true },
    });
    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }

    const currentRoles = user.platformStaff?.roles ?? [];
    const currentlyActive = user.platformStaff?.isActive ?? false;
    const willBeActive = input.isActive ?? user.platformStaff?.isActive ?? true;
    const isLosingAdmin = currentRoles.includes("admin") && (!input.roles.includes("admin") || willBeActive === false);

    if (isLosingAdmin) {
      if (id === actor.id) {
        throw new BadRequestException("Нельзя снять с себя роль admin.");
      }

      const otherAdmins = await this.prisma.platformStaff.count({
        where: {
          isActive: true,
          roles: { has: "admin" },
          userId: { not: id },
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException("Нельзя снять роль admin у последнего администратора.");
      }
    }

    if (input.roles.length === 0 && willBeActive === true) {
      throw new BadRequestException("Сотрудник не может быть активен без ролей.");
    }

    if (user.platformStaff) {
      await this.prisma.platformStaff.update({
        where: { userId: id },
        data: {
          roles: input.roles,
          isActive: input.isActive ?? user.platformStaff.isActive,
        },
      });
    } else {
      if (input.roles.length === 0) {
        return this.getUser(id);
      }
      await this.prisma.platformStaff.create({
        data: {
          userId: id,
          roles: input.roles,
          isActive: input.isActive ?? true,
        },
      });
    }

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.user.platform_roles",
      entityType: "User",
      entityId: id,
      payload: {
        rolesBefore: currentRoles,
        rolesAfter: input.roles,
        wasActive: currentlyActive,
        isActive: input.isActive ?? currentlyActive,
      },
    });

    return this.getUser(id);
  }
}

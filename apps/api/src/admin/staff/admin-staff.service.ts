import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { hash } from "bcryptjs";
import { PasswordPolicyService } from "../../auth/password-policy.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionCacheService } from "../../redis/session-cache.service";
import type { adminStaffCreateInputSchema, adminStaffUpdateInputSchema } from "./admin-staff.schemas";
import type { z } from "zod";

type CreateInput = z.infer<typeof adminStaffCreateInputSchema>;
type UpdateInput = z.infer<typeof adminStaffUpdateInputSchema>;

@Injectable()
export class AdminStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly sessionCache: SessionCacheService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  async listStaff(pagination: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(pagination.limit ?? 30, 1), 100);
    const offset = Math.max(pagination.offset ?? 0, 0);
    const [total, items] = await Promise.all([
      this.prisma.platformStaff.count(),
      this.prisma.platformStaff.findMany({
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              gender: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return { items, total, hasMore: offset + items.length < total };
  }

  async createStaff(input: CreateInput, actor: RequestUser) {
    const normalizedEmail = input.email.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { phone: input.phone }],
      },
    });

    if (existing) {
      throw new ConflictException("Пользователь с такой почтой или телефоном уже существует.");
    }

    await this.passwordPolicy.assertAcceptablePassword(input.password);

    const passwordHash = await hash(input.password, 12);
    const created = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
        passwordHash,
        platformStaff: {
          create: { roles: input.roles, isActive: true },
        },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        platformStaff: {
          select: {
            id: true,
            userId: true,
            roles: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.staff.create",
      entityType: "User",
      entityId: created.id,
      payload: { roles: input.roles, email: normalizedEmail, gender: input.gender ?? null },
    });

    return created;
  }

  async updateStaff(id: string, input: UpdateInput, actor: RequestUser) {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { userId: id },
      include: { user: { select: { id: true } } },
    });

    if (!staff) {
      throw new NotFoundException("Сотрудник не найден.");
    }

    const currentRoles = staff.roles;
    const currentlyActive = staff.isActive;
    const nextRoles = input.roles ?? currentRoles;
    const nextActive = input.isActive ?? currentlyActive;

    const losesAdmin = currentRoles.includes("admin") && (!nextRoles.includes("admin") || nextActive === false);

    if (losesAdmin) {
      if (staff.userId === actor.id) {
        throw new BadRequestException("Нельзя снять с себя роль admin или деактивировать себя.");
      }
      // «Первый админ» (env PLATFORM_OWNER_EMAIL, по умолчанию — основатель)
      // — защищён от деактивации/снятия admin даже другими админами.
      const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL ?? "mojosay@icloud.com").toLowerCase();
      const targetUser = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
      if (targetUser?.email.toLowerCase() === ownerEmail) {
        throw new BadRequestException("Этот аккаунт защищён как первый администратор платформы.");
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

    if (nextActive && nextRoles.length === 0) {
      throw new BadRequestException("Активный сотрудник должен иметь хотя бы одну роль.");
    }

    const updated = await this.prisma.platformStaff.update({
      where: { userId: id },
      data: {
        ...(input.roles ? { roles: input.roles } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });

    if (nextActive === false) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.sessionCache.invalidateUser(id);

    await this.auditLog.recordChange({
      actorId: actor.id,
      action: "admin.staff.update",
      entityType: "User",
      entityId: id,
      before: { roles: currentRoles, isActive: currentlyActive },
      after: { roles: nextRoles, isActive: nextActive },
    });

    return updated;
  }
}

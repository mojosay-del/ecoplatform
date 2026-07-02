import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { CompanyRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import {
  type AcceptCompanyInvitationDto,
  type CompanyInvitationInfo,
  type CompanyInviteDto,
  type CompanyMemberSectionsDto,
  type CompanyMembersView,
  availableMemberSections,
  computeSeatPricing,
  sanitizeMemberSections,
} from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { PasswordPolicyService } from "../auth/password-policy.service";
import { resolveAllowedCorsOrigins } from "../common/cors-origin";
import type { RequestUser } from "../common/request-user";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class CompanyMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly settings: PlatformSettingsService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  // Управлять сотрудниками может только владелец компании (companyRole=owner).
  private requireOwner(user: RequestUser): { companyId: string } {
    if (!user.companyId || !user.company) {
      throw new ForbiddenException("Действие доступно только компаниям.");
    }
    if (user.companyRole !== CompanyRole.owner) {
      throw new ForbiddenException("Управлять сотрудниками может только владелец компании.");
    }
    return { companyId: user.companyId };
  }

  async getMembersView(user: RequestUser): Promise<CompanyMembersView> {
    const { companyId } = this.requireOwner(user);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { type: true, subscriptionPlan: true },
    });
    const marketplaceEnabled = await this.settings.getValue("marketplace.enabled");

    const [users, invitations] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId },
        orderBy: [{ companyRole: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          companyRole: true,
          status: true,
          allowedSections: true,
          createdAt: true,
        },
      }),
      this.prisma.companyInvitation.findMany({
        where: { companyId, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, status: true, allowedSections: true, expiresAt: true, createdAt: true },
      }),
    ]);

    const activeCount = users.filter((member) => member.status === "active").length;

    return {
      isOwner: true,
      members: users.map((member) => ({
        userId: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.companyRole,
        status: member.status,
        allowedSections: member.allowedSections,
        createdAt: member.createdAt.toISOString(),
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        allowedSections: invitation.allowedSections,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
      })),
      availableSections: availableMemberSections(company.type, marketplaceEnabled),
      pricing: computeSeatPricing(company.subscriptionPlan, activeCount),
    };
  }

  async invite(user: RequestUser, dto: CompanyInviteDto): Promise<CompanyMembersView> {
    const { companyId } = this.requireOwner(user);
    const email = dto.email.toLowerCase();
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { type: true, organizationName: true },
    });
    const marketplaceEnabled = await this.settings.getValue("marketplace.enabled");
    const allowedSections = sanitizeMemberSections(dto.allowedSections, company.type, marketplaceEnabled);

    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      throw new BadRequestException("Пользователь с этим email уже зарегистрирован на платформе.");
    }
    const existingInvite = await this.prisma.companyInvitation.findFirst({
      where: { companyId, email, status: "pending" },
      select: { id: true },
    });
    if (existingInvite) {
      throw new BadRequestException("Этому email уже отправлено приглашение.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await this.prisma.companyInvitation.create({
      data: {
        companyId,
        email,
        invitedById: user.id,
        role: CompanyRole.member,
        allowedSections,
        tokenHash: hashInvitationToken(token),
        expiresAt,
      },
      select: { id: true },
    });

    try {
      await this.email.sendCompanyInvitation({
        to: email,
        companyName: company.organizationName,
        inviterName: `${user.firstName} ${user.lastName}`.trim(),
        acceptUrl: `${this.webOrigin()}/invite/${token}`,
        expiresAt,
      });
    } catch (error) {
      // Письмо не ушло — не оставляем «висящее» приглашение, чтобы владелец мог
      // повторить без блокировки дублей.
      await this.prisma.companyInvitation.delete({ where: { id: invitation.id } });
      throw error;
    }

    return this.getMembersView(user);
  }

  async revokeInvitation(user: RequestUser, invitationId: string): Promise<CompanyMembersView> {
    const { companyId } = this.requireOwner(user);
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, companyId: true, status: true },
    });
    if (!invitation || invitation.companyId !== companyId) {
      throw new NotFoundException("Приглашение не найдено.");
    }
    if (invitation.status === "pending") {
      await this.prisma.companyInvitation.update({ where: { id: invitationId }, data: { status: "revoked" } });
    }
    return this.getMembersView(user);
  }

  async setMemberSections(
    user: RequestUser,
    memberUserId: string,
    dto: CompanyMemberSectionsDto,
  ): Promise<CompanyMembersView> {
    const { companyId } = this.requireOwner(user);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { type: true },
    });
    const member = await this.loadManagedMember(companyId, memberUserId);
    const marketplaceEnabled = await this.settings.getValue("marketplace.enabled");
    const allowedSections = sanitizeMemberSections(dto.allowedSections, company.type, marketplaceEnabled);
    await this.prisma.user.update({ where: { id: member.id }, data: { allowedSections } });
    return this.getMembersView(user);
  }

  async removeMember(user: RequestUser, memberUserId: string): Promise<CompanyMembersView> {
    const { companyId } = this.requireOwner(user);
    const member = await this.loadManagedMember(companyId, memberUserId);
    // Аккаунт сотрудника заводился ради работы в этой компании — удаляем его
    // полностью (каскад снимает сессии и пр.). Владельца/себя удалить нельзя.
    await this.prisma.user.delete({ where: { id: member.id } });
    return this.getMembersView(user);
  }

  // Загружает сотрудника (member) той же компании; запрещает трогать владельцев
  // и самого себя.
  private async loadManagedMember(companyId: string, memberUserId: string) {
    const member = await this.prisma.user.findUnique({
      where: { id: memberUserId },
      select: { id: true, companyId: true, companyRole: true },
    });
    if (!member || member.companyId !== companyId) {
      throw new NotFoundException("Сотрудник не найден.");
    }
    if (member.companyRole !== CompanyRole.member) {
      throw new BadRequestException("Действие доступно только для приглашённых сотрудников.");
    }
    return member;
  }

  async getInvitationInfo(token: string): Promise<CompanyInvitationInfo> {
    const invitation = await this.findPendingInvitation(token);
    return { email: invitation.email, companyName: invitation.company.organizationName };
  }

  async acceptInvitation(token: string, dto: AcceptCompanyInvitationDto): Promise<{ ok: true; email: string }> {
    const invitation = await this.findPendingInvitation(token);

    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email: invitation.email }, { phone: dto.phone }] },
      select: { email: true },
    });
    if (clash) {
      throw new BadRequestException(
        clash.email === invitation.email
          ? "Аккаунт с этим email уже существует. Войдите в систему."
          : "Этот телефон уже используется другим аккаунтом.",
      );
    }

    await this.passwordPolicy.assertAcceptablePassword(dto.password);
    const passwordHash = await hash(dto.password, 12);
    const consentDocumentIds = await this.resolveConsentDocumentIds(dto.acceptedDocumentIds);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.companyInvitation.updateMany({
        where: { id: invitation.id, status: "pending", expiresAt: { gt: new Date() } },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException("Приглашение недействительно или уже принято.");
      }

      const member = await tx.user.create({
        data: {
          email: invitation.email,
          phone: dto.phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          companyId: invitation.companyId,
          companyRole: CompanyRole.member,
          allowedSections: invitation.allowedSections,
        },
      });

      await tx.companyInvitation.update({ where: { id: invitation.id }, data: { acceptedUserId: member.id } });

      if (consentDocumentIds.length) {
        await tx.consentRecord.createMany({
          data: consentDocumentIds.map((documentId) => ({
            userId: member.id,
            documentId,
            source: "registration" as const,
          })),
          skipDuplicates: true,
        });
      }
    });

    return { ok: true, email: invitation.email };
  }

  private async findPendingInvitation(token: string) {
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      select: {
        id: true,
        email: true,
        companyId: true,
        allowedSections: true,
        status: true,
        expiresAt: true,
        company: { select: { organizationName: true } },
      },
    });
    if (!invitation || invitation.status !== "pending" || invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Приглашение недействительно или срок его действия истёк.");
    }
    return invitation;
  }

  // Валидация обязательных юр-документов и сбор id для ConsentRecord — как при
  // регистрации: обязательные должны быть приняты, опциональные берём активные.
  private async resolveConsentDocumentIds(acceptedDocumentIds: string[]): Promise<string[]> {
    const requiredActive = await this.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
      select: { id: true, title: true },
    });
    const proposed = new Set(acceptedDocumentIds);
    const missing = requiredActive.filter((document) => !proposed.has(document.id));
    if (missing.length) {
      throw new BadRequestException(
        "Не подтверждены обязательные документы: " + missing.map((document) => document.title).join(", "),
      );
    }
    if (!acceptedDocumentIds.length) return [];
    const active = await this.prisma.legalDocument.findMany({
      where: { isActive: true, id: { in: acceptedDocumentIds } },
      select: { id: true },
    });
    return Array.from(new Set(active.map((document) => document.id)));
  }

  private webOrigin(): string {
    return resolveAllowedCorsOrigins()[0] ?? "http://localhost:3000";
  }
}

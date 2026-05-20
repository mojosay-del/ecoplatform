import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationCategory, SupportTicketStatus } from "@prisma/client";
import type { SupportTicketDto } from "@ecoplatform/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications?: NotificationsService,
  ) {}

  async createTicket(input: SupportTicketDto, userId: string, companyId: string) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        authorId: userId,
        companyId,
        category: input.category,
        subject: input.subject,
        messages: {
          create: {
            authorId: userId,
            authorRole: "company_user",
            text: input.text,
          },
        },
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, organizationName: true } },
        messages: true,
      },
    });

    await this.notifyTicketCreated(ticket).catch(() => undefined);

    return ticket;
  }

  async listOwn(companyId: string) {
    return this.prisma.supportTicket.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async listAdmin() {
    return this.prisma.supportTicket.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        company: { select: { id: true, organizationName: true, status: true } },
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async replyAsCompanyUser(ticketId: string, actorId: string, companyId: string, text: string) {
    // Владелец обращения определяется не пользователем из запроса, а компанией:
    // так сотрудник одной компании не сможет ответить в чужой тикет, даже зная id.
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, companyId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, organizationName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Обращение не найдено.");
    }

    const result = await this.addReply(ticket.id, actorId, "company_user", text);
    await this.notifyUserReply(ticket, result.message.id).catch(() => undefined);

    return result.ticket;
  }

  async replyAsAdmin(ticketId: string, actorId: string, text: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } },
        company: { select: { id: true, organizationName: true } },
      },
    });

    if (!ticket) {
      throw new NotFoundException("Обращение не найдено.");
    }

    const result = await this.addReply(ticket.id, actorId, "admin", text);
    await this.notifyAdminReply(ticket, result.message.id).catch(() => undefined);

    return result.ticket;
  }

  private async addReply(ticketId: string, actorId: string, actorRole: "admin" | "company_user", text: string) {
    const status = actorRole === "admin" ? SupportTicketStatus.awaiting_user : SupportTicketStatus.in_progress;

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId,
          authorId: actorId,
          authorRole: actorRole,
          text,
        },
      });

      const ticket = await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      return { ticket, message };
    });
  }

  private async notifyTicketCreated(ticket: {
    id: string;
    subject: string;
    category: string;
    author: { firstName: string; lastName: string };
    company: { organizationName: string };
  }) {
    if (!this.notifications) return;

    await this.notifications.createInAppForAdmins({
      eventType: "support.ticket.created",
      sourceId: ticket.id,
      category: NotificationCategory.support,
      title: "Новое обращение в поддержку",
      body: `${ticket.company.organizationName}: ${ticket.subject}. Автор: ${ticket.author.firstName} ${ticket.author.lastName}.`,
      link: "/admin/support",
      payload: { ticketId: ticket.id, category: ticket.category },
    });
  }

  private async notifyAdminReply(ticket: { id: string; subject: string; authorId: string }, messageId: string) {
    if (!this.notifications) return;

    await this.notifications.createInApp({
      userId: ticket.authorId,
      eventType: "support.ticket.replied_by_admin",
      sourceId: messageId,
      category: NotificationCategory.support,
      title: "Ответ поддержки",
      body: `По обращению «${ticket.subject}» появился ответ администратора.`,
      link: "/account",
      payload: { ticketId: ticket.id, messageId },
    });
  }

  private async notifyUserReply(
    ticket: {
      id: string;
      subject: string;
      author: { firstName: string; lastName: string };
      company: { organizationName: string };
    },
    messageId: string,
  ) {
    if (!this.notifications) return;

    await this.notifications.createInAppForAdmins({
      eventType: "support.ticket.replied_by_user",
      sourceId: messageId,
      category: NotificationCategory.support,
      title: "Новый ответ в обращении",
      body: `${ticket.company.organizationName}: ${ticket.subject}. Ответил ${ticket.author.firstName} ${ticket.author.lastName}.`,
      link: "/admin/support",
      payload: { ticketId: ticket.id, messageId },
    });
  }
}

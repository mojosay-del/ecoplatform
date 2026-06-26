import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationCategory, Prisma, SupportTicketStatus } from "@prisma/client";
import type { SupportTicketDto } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { paginatedResponse, resolvePagination } from "../common/pagination";
import { swallowAndLog } from "../common/silent-catch";
import { publicUrl } from "../files/files-storage.helpers";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const supportMessageSelect = {
  id: true,
  authorId: true,
  authorRole: true,
  text: true,
  isInternal: true,
  createdAt: true,
} satisfies Prisma.SupportTicketMessageSelect;

const supportMessageAuthorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarFile: { select: { storageKey: true, accessLevel: true } },
} satisfies Prisma.UserSelect;

type SupportMessagePayload = Prisma.SupportTicketMessageGetPayload<{ select: typeof supportMessageSelect }>;
type SupportMessageAuthorPayload = Prisma.UserGetPayload<{ select: typeof supportMessageAuthorSelect }>;

function supportMessages(includeInternal: boolean) {
  const base = {
    orderBy: { createdAt: "asc" as const },
    select: supportMessageSelect,
  };

  return includeInternal ? base : { ...base, where: { isInternal: false } };
}

function decorateSupportMessageAuthor(user: SupportMessageAuthorPayload | undefined) {
  if (!user) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarFile ? publicUrl(user.avatarFile.storageKey, user.avatarFile.accessLevel) : null,
  };
}

function decorateSupportMessage(message: SupportMessagePayload, authorById: Map<string, SupportMessageAuthorPayload>) {
  const { authorId, ...publicMessage } = message;

  return {
    ...publicMessage,
    author: decorateSupportMessageAuthor(authorById.get(authorId)),
  };
}

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings?: PlatformSettingsService,
    private readonly notifications?: NotificationsService,
  ) {}

  async createTicket(input: SupportTicketDto, userId: string, companyId: string) {
    // Рубильник из админки (Настройки → Поддержка). Глобальный модуль настроек
    // всегда внедряется в рантайме; `?? true` страхует только юнит-тесты,
    // которые конструируют сервис вручную без settings.
    const newTicketsEnabled = (await this.settings?.getValue("support.new_tickets_enabled")) ?? true;
    if (!newTicketsEnabled) {
      throw new ForbiddenException("Приём новых обращений временно приостановлен.");
    }

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
        messages: supportMessages(false),
      },
    });

    await this.notifyTicketCreated(ticket).catch(swallowAndLog("support.ticket.created", { ticketId: ticket.id }));

    return this.decorateSupportTicket(ticket);
  }

  async listOwn(companyId: string, pagination: { limit?: number; offset?: number } = {}) {
    const { limit, offset } = resolvePagination(pagination, { defaultLimit: 50, maxLimit: 200 });
    const where = { companyId };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        // Сообщения остаются в выдаче — UI рендерит thread прямо из listing,
        // отдельной /tickets/:id-ручки пока нет (см. PROGRESS.md, 4.1).
        include: { messages: supportMessages(false) },
      }),
    ]);

    const decoratedItems = await this.decorateSupportTickets(items);

    return paginatedResponse(decoratedItems, total, { limit, offset });
  }

  async listAdmin(pagination: { limit?: number; offset?: number } = {}) {
    const { limit, offset } = resolvePagination(pagination, { defaultLimit: 50, maxLimit: 200 });

    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          company: { select: { id: true, organizationName: true, status: true } },
          author: { select: { id: true, firstName: true, lastName: true, email: true } },
          messages: supportMessages(true),
        },
      }),
    ]);

    const decoratedItems = await this.decorateSupportTickets(items);

    return paginatedResponse(decoratedItems, total, { limit, offset });
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
    await this.notifyUserReply(ticket, result.message.id).catch(
      swallowAndLog("support.user.reply", { ticketId: ticket.id }),
    );

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
    await this.notifyAdminReply(ticket, result.message.id).catch(
      swallowAndLog("support.admin.reply", { ticketId: ticket.id }),
    );

    return result.ticket;
  }

  private async addReply(ticketId: string, actorId: string, actorRole: "admin" | "company_user", text: string) {
    const status = actorRole === "admin" ? SupportTicketStatus.awaiting_user : SupportTicketStatus.in_progress;

    const result = await this.prisma.$transaction(async (tx) => {
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
        include: { messages: supportMessages(actorRole === "admin") },
      });

      return { ticket, message };
    });

    return { ...result, ticket: await this.decorateSupportTicket(result.ticket) };
  }

  private async decorateSupportTicket<T extends { messages?: SupportMessagePayload[] }>(ticket: T) {
    const [decoratedTicket] = await this.decorateSupportTickets([ticket]);
    return decoratedTicket;
  }

  private async decorateSupportTickets<T extends { messages?: SupportMessagePayload[] }>(tickets: T[]) {
    const authorIds = [
      ...new Set(tickets.flatMap((ticket) => ticket.messages?.map((message) => message.authorId) ?? [])),
    ];

    if (authorIds.length === 0) {
      return tickets.map((ticket) => ({
        ...ticket,
        messages: ticket.messages?.map((message) => decorateSupportMessage(message, new Map())),
      }));
    }

    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: supportMessageAuthorSelect,
    });
    const authorById = new Map(authors.map((author) => [author.id, author]));

    return tickets.map((ticket) => ({
      ...ticket,
      messages: ticket.messages?.map((message) => decorateSupportMessage(message, authorById)),
    }));
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

import { Injectable, NotFoundException } from "@nestjs/common";
import { SupportTicketStatus } from "@prisma/client";
import type { SupportTicketDto } from "@ecoplatform/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(input: SupportTicketDto, userId: string, companyId: string) {
    return this.prisma.supportTicket.create({
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
      include: { messages: true },
    });
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
      include: { company: true, author: true, messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async reply(ticketId: string, actorId: string, actorRole: "admin" | "company_user", text: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });

    if (!ticket) {
      throw new NotFoundException("Обращение не найдено.");
    }

    const status = actorRole === "admin" ? SupportTicketStatus.awaiting_user : SupportTicketStatus.in_progress;

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        messages: {
          create: {
            authorId: actorId,
            authorRole: actorRole,
            text,
          },
        },
      },
      include: { messages: true },
    });
  }
}

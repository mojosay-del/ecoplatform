import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { SUPPORT_TICKET_MESSAGE_MAX_LENGTH, supportTicketDtoSchema } from "@ecoplatform/shared";
import { resolvePagination } from "../common/pagination";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { SupportService } from "./support.service";

export const supportReplySchema = z.object({ text: z.string().trim().min(1).max(SUPPORT_TICKET_MESSAGE_MAX_LENGTH) });

export const supportListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .transform((input) => resolvePagination(input, { defaultLimit: 50, maxLimit: 200 }));

function requireCompany(user: RequestUser): string {
  // У платформенного стаффа companyId=null. Поддержка-для-клиентов — только
  // для пользователей компаний; стафф пишет в админский подраздел поддержки.
  if (!user.companyId) {
    throw new ForbiddenException("Раздел доступен только пользователям компаний.");
  }
  return user.companyId;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get("support/tickets")
  async ownTickets(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.support.listOwn(requireCompany(user), parseBody(supportListQuerySchema, query));
  }

  @Post("support/tickets")
  async create(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(supportTicketDtoSchema, body);
    return this.support.createTicket(input, user.id, requireCompany(user));
  }

  @Post("support/tickets/:id/replies")
  async ownReply(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(supportReplySchema, body);
    return this.support.replyAsCompanyUser(id, user.id, requireCompany(user), input.text);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Get("admin/support/tickets")
  async adminTickets(@Query() query: Record<string, unknown>) {
    return this.support.listAdmin(parseBody(supportListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/support/tickets/:id/replies")
  async adminReply(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(supportReplySchema, body);
    return this.support.replyAsAdmin(id, user.id, input.text);
  }
}

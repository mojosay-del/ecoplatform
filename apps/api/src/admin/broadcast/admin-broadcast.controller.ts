import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import type { RequestUser } from "../../common/request-user";
import { parseBody } from "../../common/zod";
import { broadcastRecipientsQuerySchema, broadcastSendInputSchema } from "./admin-broadcast.schemas";
import { AdminBroadcastService } from "./admin-broadcast.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/broadcast")
export class AdminBroadcastController {
  constructor(private readonly service: AdminBroadcastService) {}

  // Предпросмотр: сколько пользователей попадёт под фильтры — показываем перед
  // отправкой, чтобы админ видел охват.
  @Post("recipients-count")
  async recipientsCount(@Body() body: unknown) {
    return this.service.recipientsCount(parseBody(broadcastRecipientsQuerySchema, body ?? {}).audience);
  }

  @Post()
  async send(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.send(parseBody(broadcastSendInputSchema, body), user);
  }
}

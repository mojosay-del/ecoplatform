import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { NotificationCategory } from "@prisma/client";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { parseBody } from "../common/zod";
import type { RequestUser } from "../common/request-user";
import { NotificationsService } from "./notifications.service";

const preferencesSchema = z.object({
  inAppMutedCategories: z.array(z.nativeEnum(NotificationCategory)).default([]),
  emailMutedCategories: z.array(z.nativeEnum(NotificationCategory)).default([]),
});

const listQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: unknown) {
    const input = parseBody(listQuerySchema, query);
    return this.notifications.list(user, {
      includeArchived: input.archived,
      limit: input.limit,
      offset: input.offset,
    });
  }

  @Get("unread-count")
  async unread(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user);
  }

  @Post("read-all")
  async readAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(":id/read")
  async markRead(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.notifications.markRead(id, user);
  }

  @Post(":id/archive")
  async archive(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.notifications.archive(id, user);
  }

  @Get("preferences")
  async getPreferences(@CurrentUser() user: RequestUser) {
    return this.notifications.getPreferences(user);
  }

  @Patch("preferences")
  async updatePreferences(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(preferencesSchema, body);
    return this.notifications.updatePreferences(user, input);
  }
}

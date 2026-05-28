import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminSanctionInputSchema,
  complaintInputSchema,
  moderationCaseListQuerySchema,
  moderationDecisionInputSchema,
  sanctionLiftInputSchema,
} from "./moderation.schemas";
import { ModerationService } from "./moderation.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post("moderation/complaints")
  async createComplaint(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.moderation.createComplaint(parseBody(complaintInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "moderator")
  @Get("admin/moderation/cases")
  async listCases(@Query() query: Record<string, unknown>) {
    return this.moderation.listCases(parseBody(moderationCaseListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "moderator")
  @Get("admin/moderation/cases/:id")
  async getCase(@Param("id") id: string) {
    return this.moderation.getCase(id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "moderator")
  @Post("admin/moderation/cases/:id/lock")
  async lockCase(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.moderation.takeCaseLock(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "moderator")
  @Post("admin/moderation/cases/:id/release")
  async releaseCase(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.moderation.releaseCaseLock(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "moderator")
  @Post("admin/moderation/cases/:id/decisions")
  async createDecision(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.moderation.createDecision(id, parseBody(moderationDecisionInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/moderation/cases/:id/admin-sanctions")
  async applyAdminSanction(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.moderation.applyAdminSanction(id, parseBody(adminSanctionInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/moderation/sanctions/:id/lift")
  async liftSanction(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.moderation.liftSanction(id, parseBody(sanctionLiftInputSchema, body), user);
  }
}

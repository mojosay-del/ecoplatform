import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  acceptCompanyInvitationDtoSchema,
  companyInviteDtoSchema,
  companyMemberSectionsDtoSchema,
} from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { CompanyMembersService } from "./company-members.service";

const INVITE_ACCEPT_THROTTLE = { short: { limit: 10, ttl: 60_000 } };

@Controller()
export class CompanyMembersController {
  constructor(private readonly members: CompanyMembersService) {}

  // ── Управление (только владелец компании) ────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get("company/members")
  async list(@CurrentUser() user: RequestUser) {
    return this.members.getMembersView(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post("company/members/invitations")
  async invite(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.members.invite(user, parseBody(companyInviteDtoSchema, body));
  }

  @UseGuards(JwtAuthGuard)
  @Delete("company/members/invitations/:id")
  async revoke(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.members.revokeInvitation(user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("company/members/:userId/sections")
  async setSections(@CurrentUser() user: RequestUser, @Param("userId") userId: string, @Body() body: unknown) {
    return this.members.setMemberSections(user, userId, parseBody(companyMemberSectionsDtoSchema, body));
  }

  @UseGuards(JwtAuthGuard)
  @Delete("company/members/:userId")
  async remove(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    return this.members.removeMember(user, userId);
  }

  // ── Принятие приглашения (публично, по токену) ───────────────────────────
  @Throttle(INVITE_ACCEPT_THROTTLE)
  @Get("company/invitations/:token")
  async info(@Param("token") token: string) {
    return this.members.getInvitationInfo(token);
  }

  @Throttle(INVITE_ACCEPT_THROTTLE)
  @Post("company/invitations/:token/accept")
  async accept(@Param("token") token: string, @Body() body: unknown) {
    return this.members.acceptInvitation(token, parseBody(acceptCompanyInvitationDtoSchema, body));
  }
}

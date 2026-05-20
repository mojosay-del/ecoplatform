import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import type { RequestUser } from "../../common/request-user";
import { parseBody } from "../../common/zod";
import {
  adminUserBlockInputSchema,
  adminUserListQuerySchema,
  adminUserPlatformRolesInputSchema,
  adminUserUnblockInputSchema,
} from "./admin-users.schemas";
import { AdminUsersService } from "./admin-users.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    return this.service.listUsers(parseBody(adminUserListQuerySchema, query));
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.service.getUser(id);
  }

  @Post(":id/block")
  async block(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.blockUser(id, parseBody(adminUserBlockInputSchema, body), user);
  }

  @Post(":id/unblock")
  async unblock(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.unblockUser(id, parseBody(adminUserUnblockInputSchema, body ?? {}), user);
  }

  @Patch(":id/platform-roles")
  async updateRoles(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.updatePlatformRoles(id, parseBody(adminUserPlatformRolesInputSchema, body), user);
  }
}

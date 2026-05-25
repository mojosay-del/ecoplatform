import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import type { RequestUser } from "../../common/request-user";
import { parseBody } from "../../common/zod";
import { adminStaffCreateInputSchema, adminStaffUpdateInputSchema } from "./admin-staff.schemas";
import { AdminStaffService } from "./admin-staff.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/staff")
export class AdminStaffController {
  constructor(private readonly service: AdminStaffService) {}

  @Get()
  async list() {
    return this.service.listStaff();
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.createStaff(parseBody(adminStaffCreateInputSchema, body), user);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.updateStaff(id, parseBody(adminStaffUpdateInputSchema, body), user);
  }
}

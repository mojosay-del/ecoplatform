import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import type { RequestUser } from "../../common/request-user";
import { parseBody } from "../../common/zod";
import {
  adminCompanyListQuerySchema,
  adminCompanyStatusInputSchema,
} from "./admin-companies.schemas";
import { AdminCompaniesService } from "./admin-companies.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/companies")
export class AdminCompaniesController {
  constructor(private readonly service: AdminCompaniesService) {}

  @Get()
  async list(@Query() query: Record<string, string>) {
    return this.service.listCompanies(parseBody(adminCompanyListQuerySchema, query));
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.service.getCompany(id);
  }

  @Post(":id/status")
  async changeStatus(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.service.changeStatus(id, parseBody(adminCompanyStatusInputSchema, body), user);
  }
}

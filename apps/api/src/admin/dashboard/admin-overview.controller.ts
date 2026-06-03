import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import type { RequestUser } from "../../common/request-user";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { AdminDashboardService } from "./admin-dashboard.service";

// Отдельный контроллер для не-админ-персонала: контент-менеджер и модератор не
// имеют доступа к полному /admin/dashboard, но получают лёгкую роль-сводку.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "content_manager", "moderator")
@Controller("admin/overview")
export class AdminOverviewController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get()
  async getOverview(@CurrentUser() user: RequestUser) {
    return this.service.getStaffSummary(user.platformRoles);
  }
}

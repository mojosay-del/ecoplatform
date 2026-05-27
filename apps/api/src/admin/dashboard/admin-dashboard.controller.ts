import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { AdminDashboardService } from "./admin-dashboard.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get()
  async getSummary() {
    return this.service.getSummary();
  }
}

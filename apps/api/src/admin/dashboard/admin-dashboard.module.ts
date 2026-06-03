import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { HealthModule } from "../../health/health.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminOverviewController } from "./admin-overview.controller";

@Module({
  imports: [AuthModule, HealthModule],
  controllers: [AdminDashboardController, AdminOverviewController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}

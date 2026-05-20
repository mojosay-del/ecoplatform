import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { AdminCompaniesController } from "./admin-companies.controller";
import { AdminCompaniesService } from "./admin-companies.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService, AdminActionLogService],
})
export class AdminCompaniesModule {}

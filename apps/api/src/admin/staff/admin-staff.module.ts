import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminStaffController],
  providers: [AdminStaffService, AdminActionLogService],
})
export class AdminStaffModule {}

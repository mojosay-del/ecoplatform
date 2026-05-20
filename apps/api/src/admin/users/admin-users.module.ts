import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminActionLogService],
})
export class AdminUsersModule {}

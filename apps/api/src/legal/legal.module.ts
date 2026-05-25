import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { AdminLegalController } from "./admin-legal.controller";
import { LegalController } from "./legal.controller";
import { LegalService } from "./legal.service";

@Module({
  imports: [AuthModule],
  controllers: [LegalController, AdminLegalController],
  providers: [LegalService, AdminActionLogService],
  exports: [LegalService],
})
export class LegalModule {}

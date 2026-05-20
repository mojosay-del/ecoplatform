import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  imports: [AuthModule],
  controllers: [ContentController],
  providers: [ContentService, AdminActionLogService],
})
export class ContentModule {}

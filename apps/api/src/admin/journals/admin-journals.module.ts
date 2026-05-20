import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminJournalsController } from "./admin-journals.controller";
import { AdminJournalsService } from "./admin-journals.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminJournalsController],
  providers: [AdminJournalsService],
})
export class AdminJournalsModule {}

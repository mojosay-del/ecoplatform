import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BillingModule } from "../billing/billing.module";
import { FilesModule } from "../files/files.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [ScheduleModule.forRoot(), BillingModule, FilesModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { BillingModule } from "../billing/billing.module";
import { FilesModule } from "../files/files.module";
import { ForumModule } from "../forum/forum.module";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [ScheduleModule.forRoot(), BillingModule, FilesModule, ForumModule, MarketplaceModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

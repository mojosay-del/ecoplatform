import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GeocodingModule } from "../geo/geocoding.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BillingNotificationsService } from "./billing-notifications.service";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuthModule, GeocodingModule, NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingNotificationsService],
  exports: [BillingNotificationsService],
})
export class BillingModule {}

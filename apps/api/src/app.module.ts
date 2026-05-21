import { Module } from "@nestjs/common";
import { AdminCompaniesModule } from "./admin/companies/admin-companies.module";
import { AdminJournalsModule } from "./admin/journals/admin-journals.module";
import { PlatformSettingsModule } from "./admin/settings/platform-settings.module";
import { AdminStaffModule } from "./admin/staff/admin-staff.module";
import { AdminUsersModule } from "./admin/users/admin-users.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ContentModule } from "./content/content.module";
import { FilesModule } from "./files/files.module";
import { ModerationModule } from "./moderation/moderation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    PrismaModule,
    PlatformSettingsModule,
    AuthModule,
    AdminCompaniesModule,
    AdminJournalsModule,
    AdminStaffModule,
    AdminUsersModule,
    BillingModule,
    ContentModule,
    FilesModule,
    ModerationModule,
    NotificationsModule,
    SchedulerModule,
    SupportModule,
  ],
})
export class AppModule {}

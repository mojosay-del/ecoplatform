import { Module } from "@nestjs/common";
import { AdminCompaniesModule } from "./admin/companies/admin-companies.module";
import { AdminUsersModule } from "./admin/users/admin-users.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ContentModule } from "./content/content.module";
import { FilesModule } from "./files/files.module";
import { ModerationModule } from "./moderation/moderation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AdminCompaniesModule,
    AdminUsersModule,
    BillingModule,
    ContentModule,
    FilesModule,
    ModerationModule,
    NotificationsModule,
    SupportModule,
  ],
})
export class AppModule {}

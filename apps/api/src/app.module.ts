import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ContentModule } from "./content/content.module";
import { FilesModule } from "./files/files.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SupportModule } from "./support/support.module";

@Module({
  imports: [
    JwtModule.register({}),
    PrismaModule,
    AuthModule,
    BillingModule,
    ContentModule,
    FilesModule,
    SupportModule,
  ],
})
export class AppModule {}

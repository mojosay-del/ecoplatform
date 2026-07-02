import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";
import { CompanyMembersController } from "./company-members.controller";
import { CompanyMembersService } from "./company-members.service";

// AuthModule — ради JwtAuthGuard и PasswordPolicyService; EmailModule — ради
// отправки приглашений. PrismaModule и PlatformSettingsModule глобальные.
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [CompanyMembersController],
  providers: [CompanyMembersService],
})
export class CompanyMembersModule {}

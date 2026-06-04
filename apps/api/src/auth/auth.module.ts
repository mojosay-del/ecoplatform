import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { EmailModule } from "../email/email.module";
import { RedisModule } from "../redis/redis.module";
import { AuthDataExportService } from "./auth-data-export.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordPolicyService } from "./password-policy.service";

@Module({
  imports: [JwtModule.register({}), RedisModule, EmailModule],
  controllers: [AuthController],
  providers: [AuthService, AuthDataExportService, PasswordPolicyService, JwtAuthGuard, RolesGuard],
  // JwtModule реэкспортируем, чтобы гварды, импортированные в другие модули,
  // могли получить JwtService через AuthModule.
  exports: [AuthService, PasswordPolicyService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}

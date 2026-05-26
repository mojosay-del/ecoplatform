import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { HealthController, ReadyController } from "./health.controller";
import { HealthDependencyIndicator } from "./health-dependency.indicator";

@Module({
  imports: [TerminusModule, PrismaModule, RedisModule, FilesModule, AuthModule],
  controllers: [HealthController, ReadyController],
  providers: [HealthDependencyIndicator],
})
export class HealthModule {}

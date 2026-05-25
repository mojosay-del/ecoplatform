import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { PrismaModule } from "../prisma/prisma.module";
import { HealthController, ReadyController } from "./health.controller";

@Module({
  imports: [TerminusModule, PrismaModule],
  controllers: [HealthController, ReadyController],
})
export class HealthModule {}

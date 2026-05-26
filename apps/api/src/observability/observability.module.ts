import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BusinessMetricsCollector } from "./business-metrics.collector";
import { MetricsController } from "./metrics.controller";
import { MetricsMiddleware } from "./metrics.middleware";
import { MetricsService } from "./metrics.service";

@Module({
  imports: [PrismaModule],
  controllers: [MetricsController],
  providers: [BusinessMetricsCollector, MetricsMiddleware, MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes("*");
  }
}

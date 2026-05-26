import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { setSubscriptionsActiveCollector } from "./metrics.registry";

@Injectable()
export class BusinessMetricsCollector implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    setSubscriptionsActiveCollector(() =>
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.active } }),
    );
  }

  onModuleDestroy(): void {
    setSubscriptionsActiveCollector(null);
  }
}

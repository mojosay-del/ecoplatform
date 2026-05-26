import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { setDatabaseConnectionSnapshotCollector, setSubscriptionsActiveCollector } from "./metrics.registry";

type PostgresConnectionSnapshotRow = {
  usedConnections: number | bigint | string | null;
  maxConnections: number | bigint | string | null;
};

@Injectable()
export class BusinessMetricsCollector implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    setSubscriptionsActiveCollector(() =>
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.active } }),
    );
    setDatabaseConnectionSnapshotCollector(() => this.readDatabaseConnectionSnapshot());
  }

  onModuleDestroy(): void {
    setSubscriptionsActiveCollector(null);
    setDatabaseConnectionSnapshotCollector(null);
  }

  private async readDatabaseConnectionSnapshot() {
    const rows = await this.prisma.$queryRaw<PostgresConnectionSnapshotRow[]>`
      SELECT
        COUNT(*)::int AS "usedConnections",
        current_setting('max_connections')::int AS "maxConnections"
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    const snapshot = rows.at(0);

    return {
      usedConnections: toSafeMetricNumber(snapshot?.usedConnections, 0),
      maxConnections: Math.max(1, toSafeMetricNumber(snapshot?.maxConnections, 1)),
    };
  }
}

function toSafeMetricNumber(value: number | bigint | string | null | undefined, fallback: number): number {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

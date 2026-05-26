import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({ service: "ecoplatform_api" });
collectDefaultMetrics({ register: metricsRegistry });

let subscriptionsActiveCollector: (() => Promise<number>) | null = null;

const metricsCollectionErrorsTotal = new Counter<"collector">({
  name: "metrics_collection_errors_total",
  help: "Total metric collection errors by collector.",
  labelNames: ["collector"],
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram<"method" | "route" | "status">({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const prismaQueryDurationSeconds = new Histogram<"target">({
  name: "prisma_query_duration_seconds",
  help: "Prisma query duration in seconds.",
  labelNames: ["target"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [metricsRegistry],
});

const authCacheHitTotal = new Counter({
  name: "auth_cache_hit_total",
  help: "Total JwtAuthGuard session cache hits.",
  registers: [metricsRegistry],
});

const authCacheMissTotal = new Counter({
  name: "auth_cache_miss_total",
  help: "Total JwtAuthGuard session cache misses.",
  registers: [metricsRegistry],
});

const usersRegisteredTotal = new Counter({
  name: "users_registered_total",
  help: "Total successfully registered users.",
  registers: [metricsRegistry],
});

const notificationsSentTotal = new Counter<"category" | "channel">({
  name: "notifications_sent_total",
  help: "Total notifications accepted by the notification service.",
  labelNames: ["category", "channel"],
  registers: [metricsRegistry],
});

new Gauge({
  name: "subscriptions_active",
  help: "Current number of active subscriptions.",
  registers: [metricsRegistry],
  async collect(this: Gauge<string>) {
    if (!subscriptionsActiveCollector) return;
    try {
      this.set(await subscriptionsActiveCollector());
    } catch {
      metricsCollectionErrorsTotal.inc({ collector: "subscriptions_active" });
    }
  },
});

export function setSubscriptionsActiveCollector(collector: (() => Promise<number>) | null): void {
  subscriptionsActiveCollector = collector;
}

export function observeHttpRequest(
  labels: { method: string; route: string; status: string },
  durationSeconds: number,
): void {
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

export function observePrismaQueryDuration(durationMs: number, target: string): void {
  prismaQueryDurationSeconds.observe({ target: target || "unknown" }, durationMs / 1000);
}

export function recordAuthCacheHit(): void {
  authCacheHitTotal.inc();
}

export function recordAuthCacheMiss(): void {
  authCacheMissTotal.inc();
}

export function recordUserRegistered(): void {
  usersRegisteredTotal.inc();
}

export function recordNotificationSent(category: string, channel: "in_app" | "email"): void {
  notificationsSentTotal.inc({ category, channel });
}

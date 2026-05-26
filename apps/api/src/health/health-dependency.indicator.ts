import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

type CheckOptions = {
  detailed?: boolean;
};

@Injectable()
export class HealthDependencyIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly files: FilesService,
  ) {}

  process(key: string, options: CheckOptions = {}) {
    const data = options.detailed
      ? {
          uptimeSeconds: Math.round(process.uptime()),
          nodeEnv: process.env.NODE_ENV ?? "development",
        }
      : undefined;

    return this.indicator.check(key).up(data);
  }

  async database(key: string, options: CheckOptions = {}) {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.indicator.check(key).up(this.successData(startedAt, options));
    } catch (error) {
      return this.indicator.check(key).down(this.failureData(startedAt, error, options));
    }
  }

  async redisCache(key: string, options: CheckOptions = {}) {
    const startedAt = Date.now();

    if (!this.redis.isConfigured) {
      return this.indicator.check(key).up({
        configured: false,
        mode: "fallback",
        ...this.successData(startedAt, options),
      });
    }

    const pong = await this.redis.ping();
    if (pong === "PONG") {
      return this.indicator.check(key).up({
        configured: true,
        mode: "redis",
        ...this.successData(startedAt, options),
      });
    }

    return this.indicator.check(key).down({
      configured: true,
      redisStatus: this.redis.status,
      ...this.failureData(startedAt, null, options),
    });
  }

  async objectStorage(key: string, options: CheckOptions = {}) {
    const startedAt = Date.now();
    const config = this.files.getS3HealthConfig();

    if (!config.configured) {
      const payload = {
        configured: false,
        required: this.isProduction(),
        ...this.successData(startedAt, options),
      };

      if (this.isProduction()) {
        return this.indicator.check(key).down(payload);
      }

      return this.indicator.check(key).up(payload);
    }

    try {
      await this.files.pingS3();
      const details = options.detailed ? { endpoint: config.endpoint, bucket: config.bucket } : {};
      return this.indicator.check(key).up({
        configured: true,
        ...details,
        ...this.successData(startedAt, options),
      });
    } catch (error) {
      return this.indicator.check(key).down({
        configured: true,
        ...this.failureData(startedAt, error, options),
      });
    }
  }

  private successData(startedAt: number, options: CheckOptions): Record<string, unknown> {
    if (!options.detailed) {
      return {};
    }

    return { latencyMs: Date.now() - startedAt };
  }

  private failureData(startedAt: number, error: unknown, options: CheckOptions): Record<string, unknown> {
    const base: Record<string, unknown> = {
      reason: "unavailable",
      ...this.successData(startedAt, options),
    };

    if (!options.detailed || !error) {
      return base;
    }

    return {
      ...base,
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    };
  }

  private isProduction() {
    return process.env.NODE_ENV === "production";
  }
}

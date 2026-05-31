import { describe, expect, it, vi } from "vitest";
import { HealthIndicatorService } from "@nestjs/terminus";
import { EmailService } from "../email/email.service";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { HealthDependencyIndicator } from "./health-dependency.indicator";

function createIndicator(
  options: {
    prisma?: Partial<PrismaService>;
    redis?: Partial<RedisService>;
    files?: Partial<FilesService>;
    email?: Partial<EmailService>;
  } = {},
) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]),
    ...options.prisma,
  } as unknown as PrismaService;
  const redis = {
    isConfigured: false,
    status: "not_configured",
    ping: vi.fn(),
    ...options.redis,
  } as unknown as RedisService;
  const files = {
    getS3HealthConfig: vi.fn().mockReturnValue({ configured: false }),
    pingS3: vi.fn(),
    ...options.files,
  } as unknown as FilesService;
  const email = {
    getHealthConfig: vi.fn().mockReturnValue({
      configured: false,
      deliveryDisabled: false,
      missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
      invalid: [],
      host: null,
    }),
    ...options.email,
  } as unknown as EmailService;

  return new HealthDependencyIndicator(new HealthIndicatorService(), prisma, redis, files, email);
}

describe("HealthDependencyIndicator", () => {
  it("проверяет Postgres лёгким SELECT 1", async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ok: 1 }]) };
    const indicator = createIndicator({ prisma: prisma as unknown as PrismaService });

    await expect(indicator.database("database")).resolves.toEqual({ database: { status: "up" } });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("показывает Redis fallback, если REDIS_URL не задан", async () => {
    const indicator = createIndicator();

    await expect(indicator.redisCache("redis")).resolves.toEqual({
      redis: { status: "up", configured: false, mode: "fallback" },
    });
  });

  it("роняет readiness по Redis, если REDIS_URL задан, но ping не отвечает", async () => {
    const indicator = createIndicator({
      redis: {
        isConfigured: true,
        status: "reconnecting",
        ping: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(indicator.redisCache("redis")).resolves.toEqual({
      redis: { status: "down", configured: true, redisStatus: "reconnecting", reason: "unavailable" },
    });
  });

  it("не требует S3 вне production, если переменные S3 не заданы", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const indicator = createIndicator();

    try {
      await expect(indicator.objectStorage("s3")).resolves.toEqual({
        s3: { status: "up", configured: false, required: false },
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("требует S3 в production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const indicator = createIndicator();

    try {
      await expect(indicator.objectStorage("s3")).resolves.toEqual({
        s3: { status: "down", configured: false, required: true },
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("требует SMTP-настройки в production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const indicator = createIndicator();

    try {
      expect(indicator.emailDelivery("email")).toEqual({
        email: {
          status: "down",
          configured: false,
          required: true,
          disabled: false,
          missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
          invalid: [],
        },
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("подтверждает настроенный SMTP без отправки письма", async () => {
    const indicator = createIndicator({
      email: {
        getHealthConfig: vi.fn().mockReturnValue({
          configured: true,
          deliveryDisabled: false,
          missing: [],
          invalid: [],
          host: "smtp.example.test",
        }),
      },
    });

    expect(indicator.emailDelivery("email", { detailed: true })).toEqual({
      email: {
        status: "up",
        configured: true,
        required: false,
        disabled: false,
        host: "smtp.example.test",
        missing: [],
        invalid: [],
      },
    });
  });

  it("пингует настроенный S3 bucket", async () => {
    const files = {
      getS3HealthConfig: vi.fn().mockReturnValue({
        configured: true,
        endpoint: "https://s3.example.test",
        bucket: "test-bucket",
      }),
      pingS3: vi.fn().mockResolvedValue(undefined),
    };
    const indicator = createIndicator({ files: files as unknown as FilesService });

    const result = await indicator.objectStorage("s3", { detailed: true });

    expect(result.s3.status).toBe("up");
    expect(result.s3.configured).toBe(true);
    expect(result.s3.endpoint).toBe("https://s3.example.test");
    expect(result.s3.bucket).toBe("test-bucket");
    expect(result.s3.latencyMs).toEqual(expect.any(Number));
    expect(files.pingS3).toHaveBeenCalledOnce();
  });
});

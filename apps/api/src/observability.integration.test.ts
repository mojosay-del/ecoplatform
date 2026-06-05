import type { IncomingMessage } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import {
  CommentStatus,
  CompanyRole,
  CompanyStatus,
  ContentStatus,
  FileAccessLevel,
  LegalDocumentType,
  PlatformRole,
  SanctionType,
  SubscriptionStatus,
  UserStatus,
} from "@prisma/client";
import { BillingNotificationsService } from "./billing/billing-notifications.service";
import { SchedulerService } from "./scheduler/scheduler.service";
import { setupIntegrationContext } from "./test/integration-context";
import {
  REQUIRED_DOC_IDS_FOR_TESTS,
  TEST_EMAIL_VERIFICATION_CODE,
  expectPaginatedEnvelope,
  parseBinary,
  responseCookieFull,
  responseCookiePart,
  responseCookieParts,
  restoreEnv,
  withEnv,
} from "./test/integration-helpers";

const ctx = setupIntegrationContext();
const {
  loginAdmin,
  loginModerator,
  loginContentManager,
  submitRegistration,
  verifyRegistration,
  registerWithBody,
  registerCompany,
  createPublishedNewsWithComment,
  createPublishedNews,
  createCoverAsset,
  createPublishedKnowledgeArticle,
} = ctx;

describe("Observability", () => {
  it("разделяет liveness, readiness и deep health-check", async () => {
    await withEnv(
      {
        REDIS_URL: undefined,
        S3_ENDPOINT: undefined,
        S3_REGION: undefined,
        S3_BUCKET: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
        S3_PUBLIC_BASE_URL: undefined,
      },
      async () => {
        const liveness = await ctx.rawHttp.get("/api/health");
        expect(liveness.status).toBe(200);
        expect(liveness.body.details.process.status).toBe("up");

        const readiness = await ctx.rawHttp.get("/api/ready");
        expect(readiness.status).toBe(200);
        expect(readiness.body.details.database.status).toBe("up");
        expect(readiness.body.details.redis).toMatchObject({ status: "up", configured: false });
        expect(readiness.body.details.s3).toMatchObject({ status: "up", configured: false });

        const missingAuth = await ctx.rawHttp.get("/api/health/deep");
        expect(missingAuth.status).toBe(401);

        const adminToken = await loginAdmin();
        const deep = await ctx.rawHttp.get("/api/health/deep").set("Authorization", `Bearer ${adminToken}`);
        expect(deep.status).toBe(200);
        expect(deep.body.details.process.uptimeSeconds).toEqual(expect.any(Number));
        expect(deep.body.details.database.latencyMs).toEqual(expect.any(Number));
        expect(deep.body.details.redis).toMatchObject({ status: "up", configured: false, mode: "fallback" });
        expect(deep.body.details.s3).toMatchObject({ status: "up", configured: false, required: false });
      },
    );
  });

  it("отдаёт Prometheus-метрики API", async () => {
    await ctx.rawHttp.get("/api/health");
    await loginAdmin();

    const res = await ctx.rawHttp.get("/api/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("# HELP http_request_duration_seconds");
    expect(res.text).toContain("# HELP prisma_query_duration_seconds");
    expect(res.text).toContain("# HELP auth_cache_miss_total");
    expect(res.text).toContain("# HELP users_registered_total");
    expect(res.text).toContain("# HELP notifications_sent_total");
    expect(res.text).toContain("# HELP subscriptions_active");
    expect(res.text).toContain("# HELP db_connections");
    expect(res.text).toContain('state="used"');
    expect(res.text).toContain('state="max"');
  });

  it("в production закрывает /api/metrics через Basic Auth", async () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      user: process.env.METRICS_BASIC_USER,
      password: process.env.METRICS_BASIC_PASSWORD,
    };
    process.env.NODE_ENV = "production";
    process.env.METRICS_BASIC_USER = "prometheus";
    process.env.METRICS_BASIC_PASSWORD = "super-secret-metrics-password";

    try {
      const missingAuth = await ctx.rawHttp.get("/api/metrics");
      expect(missingAuth.status).toBe(401);
      expect(missingAuth.headers["www-authenticate"]).toContain("Basic");

      const ok = await ctx.rawHttp
        .get("/api/metrics")
        .set("Authorization", `Basic ${Buffer.from("prometheus:super-secret-metrics-password").toString("base64")}`);
      expect(ok.status).toBe(200);
      expect(ok.text).toContain("# HELP http_request_duration_seconds");
    } finally {
      restoreEnv("NODE_ENV", previous.nodeEnv);
      restoreEnv("METRICS_BASIC_USER", previous.user);
      restoreEnv("METRICS_BASIC_PASSWORD", previous.password);
    }
  });
});

describe("Admin dashboard", () => {
  it("отдаёт операционные сигналы и здоровье системы только админу", async () => {
    await withEnv(
      {
        NODE_ENV: "test",
        REDIS_URL: undefined,
        S3_ENDPOINT: undefined,
        S3_REGION: undefined,
        S3_BUCKET: undefined,
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
        S3_PUBLIC_BASE_URL: undefined,
      },
      async () => {
        const adminToken = await loginAdmin();
        const moderatorToken = await loginModerator();
        const passwordHash = await hash("User12345678", 4);

        await ctx.prisma.company.create({
          data: {
            organizationName: "ООО Просрочка",
            status: CompanyStatus.past_due,
            subscriptionEndsAt: new Date(Date.now() - 60_000),
          },
        });
        await ctx.prisma.user.createMany({
          data: [
            {
              email: "delete-me@test.local",
              firstName: "Удаление",
              lastName: "Аккаунта",
              phone: "+70000000991",
              passwordHash,
              deletionRequestedAt: new Date(),
            },
            {
              email: "locked@test.local",
              firstName: "Временная",
              lastName: "Блокировка",
              phone: "+70000000992",
              passwordHash,
              lockedUntil: new Date(Date.now() + 15 * 60_000),
            },
          ],
        });

        const forbidden = await ctx.http.get("/api/admin/dashboard").set("Authorization", `Bearer ${moderatorToken}`);
        expect(forbidden.status).toBe(403);

        const res = await ctx.http.get("/api/admin/dashboard").set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.operations).toEqual({
          pendingDeletionRequests: 1,
          pastDueCompanies: 1,
          lockedAccounts: 1,
        });
        expect(res.body.systemHealth).toEqual({
          database: "ok",
          redis: "disabled",
          storage: "disabled",
        });
      },
    );
  });
});

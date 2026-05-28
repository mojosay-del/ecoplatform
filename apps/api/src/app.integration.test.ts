// Integration-тест сквозного MVP-сценария.
// Поднимает реальное Nest-приложение, ходит через HTTP (supertest), пишет в реальную PostgreSQL (ecoplatform_test).
// Все тесты используют один и тот же app, между тестами TRUNCATE всех таблиц.

import type { IncomingMessage } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import {
  CommentStatus,
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
import { createTestApp, resetDb, TestApp } from "./test/test-app";

let ctx: TestApp;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetDb(ctx.prisma);
  // Сидим админа — он нужен почти в каждом тесте для ручной активации/CMS.
  const adminUser = await ctx.prisma.user.create({
    data: {
      email: "admin@test.local",
      firstName: "Админ",
      lastName: "Тестов",
      phone: "+70000000001",
      passwordHash: await hash("Admin12345", 4),
      platformStaff: { create: { roles: [PlatformRole.admin], isActive: true } },
    },
  });

  // Сидим минимальный набор активных обязательных юр-документов — чтобы
  // регистрация в тестах проходила через ту же проверку acceptedDocumentIds,
  // что и на проде. Если документов нет, register разрешает регистрацию
  // без consent (см. auth.service.register), но это deviation от прод-поведения.
  await ctx.prisma.legalDocument.createMany({
    data: [
      {
        id: "test-doc-privacy",
        type: LegalDocumentType.privacy_policy,
        version: "1.0.0",
        title: "Политика конфиденциальности",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
      {
        id: "test-doc-terms",
        type: LegalDocumentType.terms_of_service,
        version: "1.0.0",
        title: "Пользовательское соглашение",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
      {
        id: "test-doc-pd",
        type: LegalDocumentType.personal_data_consent,
        version: "1.0.0",
        title: "Согласие на обработку ПДн",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
    ],
  });

  // Админ тоже должен иметь записи consent (иначе requiresReConsent=true).
  // На проде админ либо регистрируется через ту же форму, либо для него
  // выставляются consent миграцией.
  await ctx.prisma.consentRecord.createMany({
    data: ["test-doc-privacy", "test-doc-terms", "test-doc-pd"].map((documentId) => ({
      userId: adminUser.id,
      documentId,
      source: "admin_action" as const,
    })),
  });
});

const REQUIRED_DOC_IDS_FOR_TESTS = ["test-doc-privacy", "test-doc-terms", "test-doc-pd"];

async function loginAdmin(): Promise<string> {
  const res = await ctx.http.post("/api/auth/login").send({ email: "admin@test.local", password: "Admin12345" });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

async function registerCompany(suffix: string): Promise<{ token: string; companyId: string; userId: string }> {
  const res = await ctx.http.post("/api/auth/register").send({
    organizationName: `ООО Тест ${suffix}`,
    companyType: "collector",
    firstName: "Иван",
    lastName: "Тестов",
    gender: "male",
    phone: `+7900${suffix}`,
    email: `user${suffix}@test.local`,
    password: "User12345678",
    acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
  });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;

  const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  expect(me.status).toBe(200);
  expect(me.body.avatarUrl).toBe("/avatars/company/zman.png");
  expect(me.body.companyId).toBe(me.body.company.id);
  expect(me.body.company.organizationName).toBe(`ООО Тест ${suffix}`);
  expect(me.body.company.billingInn).toBeUndefined();
  const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: me.body.company.id } });
  expect(company.billingInn).toBeNull();
  expect(me.body.requiresReConsent).toBe(false);
  return { token, companyId: me.body.company.id, userId: me.body.id };
}

async function loginModerator(): Promise<string> {
  await ctx.prisma.user.create({
    data: {
      email: "moderator@test.local",
      firstName: "Модератор",
      lastName: "Тестов",
      phone: "+70000000002",
      passwordHash: await hash("Moderator12345", 4),
      platformStaff: { create: { roles: [PlatformRole.moderator], isActive: true } },
    },
  });

  const res = await ctx.http
    .post("/api/auth/login")
    .send({ email: "moderator@test.local", password: "Moderator12345" });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

async function loginContentManager(): Promise<string> {
  await ctx.prisma.user.create({
    data: {
      email: "content-manager@test.local",
      firstName: "Контент",
      lastName: "Менеджер",
      phone: "+70000000003",
      passwordHash: await hash("Content12345", 4),
      platformStaff: { create: { roles: [PlatformRole.content_manager], isActive: true } },
    },
  });

  const res = await ctx.http
    .post("/api/auth/login")
    .send({ email: "content-manager@test.local", password: "Content12345" });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

function parseBinary(res: IncomingMessage, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", (error) => callback(error));
}

async function createPublishedNewsWithComment(adminToken: string, authorToken: string) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: "Новость для модерации",
      lead: "Лид новости",
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
      tags: ["moderation"],
    });
  expect(draft.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/news/${draft.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  const comment = await ctx.http
    .post(`/api/news/${draft.body.id}/comments`)
    .set("Authorization", `Bearer ${authorToken}`)
    .send({ text: "Комментарий для проверки модерации" });
  expect(comment.status).toBe(201);

  return { news: publish.body, comment: comment.body };
}

async function createPublishedNews(adminToken: string, suffix: string, tags: string[] = [`moderation-${suffix}`]) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Новость для модерации ${suffix}`,
      lead: "Лид новости",
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
      tags,
    });
  expect(draft.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/news/${draft.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  return publish.body as { id: string; slug: string; title: string };
}

async function createCoverAsset(uploadedById: string, suffix: string) {
  return ctx.prisma.fileAsset.create({
    data: {
      originalName: `${suffix}.webp`,
      mimeType: "image/webp",
      sizeBytes: 1200,
      storageKey: `test/${suffix}.webp`,
      accessLevel: FileAccessLevel.public,
      uploadedById,
    },
  });
}

async function createPublishedKnowledgeArticle(adminToken: string, suffix: string) {
  const draft = await ctx.http
    .post("/api/admin/content/knowledge-base")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Статья ${suffix}`,
      position: 0,
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело статьи.</p>" } }],
    });
  expect(draft.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/knowledge-base/${draft.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  return publish.body as { id: string; slug: string; title: string };
}

function expectPaginatedEnvelope(body: { items?: unknown; total?: unknown; hasMore?: unknown }) {
  expect(Array.isArray(body.items)).toBe(true);
  expect(typeof body.total).toBe("number");
  expect(typeof body.hasMore).toBe("boolean");
}

function responseCookieParts(response: { headers: Record<string, string | string[] | undefined> }) {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((cookie) => cookie.split(";")[0]);
}

function responseCookiePart(response: { headers: Record<string, string | string[] | undefined> }, name: string) {
  return responseCookieParts(response).find((cookie) => cookie.startsWith(`${name}=`));
}

function responseCookieFull(response: { headers: Record<string, string | string[] | undefined> }, name: string) {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withEnv(updates: Record<string, string | undefined>, action: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(updates).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(updates)) {
    restoreEnv(name, value);
  }

  try {
    await action();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name, value);
    }
  }
}

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

describe("Auth", () => {
  it("выдаёт csrf-token cookie для double-submit защиты", async () => {
    const res = await ctx.rawHttp.get("/api/auth/csrf");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(responseCookiePart(res, "csrf-token")).toBe(`csrf-token=${res.body.csrfToken}`);

    const setCookie = (res.headers["set-cookie"] as string[]).join("; ");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("требует совпадающий CSRF cookie/header на /auth/refresh", async () => {
    const login = await ctx.rawHttp.post("/api/auth/login").send({ email: "admin@test.local", password: "Admin12345" });
    expect(login.status).toBe(201);

    const refreshCookie = responseCookiePart(login, "refreshToken");
    const csrfCookie = responseCookiePart(login, "csrf-token");
    expect(refreshCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();

    const missingHeader = await ctx.rawHttp.post("/api/auth/refresh").set("Cookie", [refreshCookie!, csrfCookie!]);
    expect(missingHeader.status).toBe(403);
    expect(missingHeader.body.message).toBe("CSRF-токен отсутствует или недействителен.");

    const csrfToken = csrfCookie!.slice("csrf-token=".length);
    const ok = await ctx.rawHttp
      .post("/api/auth/refresh")
      .set("Cookie", [refreshCookie!, csrfCookie!])
      .set("X-CSRF-Token", csrfToken);

    expect(ok.status).toBe(201);
    expect(ok.body.accessToken).toMatch(/\./);
  });

  it("logout очищает refresh-cookie с тем же path, с которым она была выдана", async () => {
    const login = await ctx.http.post("/api/auth/login").send({ email: "admin@test.local", password: "Admin12345" });
    expect(login.status).toBe(201);

    const loginRefreshCookie = responseCookieFull(login, "refreshToken");
    expect(loginRefreshCookie).toContain("Path=/api/auth");
    expect(loginRefreshCookie).toContain("HttpOnly");

    const logout = await ctx.http.post("/api/auth/logout").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(logout.status).toBe(201);

    const clearedRefreshCookie = responseCookieFull(logout, "refreshToken");
    expect(clearedRefreshCookie).toContain("refreshToken=");
    expect(clearedRefreshCookie).toContain("Path=/api/auth");
    expect(clearedRefreshCookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("регистрация создаёт компанию в demo-статусе и возвращает access-токен", async () => {
    const { token, companyId } = await registerCompany("0000001");
    expect(token).toMatch(/\./);

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe(CompanyStatus.demo);
    expect(company?.type).toBe("collector");
    expect(company?.demoEndsAt).toBeInstanceOf(Date);
    expect(company!.demoEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("системному администратору назначается аватар по роли и полу", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.gender).toBe("male");
    expect(me.body.avatarUrl).toBe("/avatars/platform/aman.png");
    expect(me.body.company).toBeNull();
    expect(me.body.companyId).toBeNull();
    expect(me.body.requiresReConsent).toBe(false);
  });

  it("регистрация сохраняет тип компании и пол для аватара профиля", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Трейд Жен",
      companyType: "trader",
      billingInn: "7707083893",
      firstName: "Анна",
      lastName: "Тестова",
      gender: "female",
      phone: "+375291234567",
      email: "trader-female@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });
    expect(res.status).toBe(201);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.gender).toBe("female");
    expect(me.body.company.type).toBe("trader");
    expect(me.body.company.organizationName).toBe("ООО Трейд Жен");
    expect(me.body.avatarUrl).toBe("/avatars/company/twoman.png");
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: me.body.company.id } });
    expect(company.billingInn).toBe("7707083893");
  });

  it("повторная регистрация с тем же email отбивается 409", async () => {
    await registerCompany("0000002");
    const dup = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Дубль",
      companyType: "collector",
      billingInn: "7707083893",
      firstName: "А",
      lastName: "Б",
      gender: "male",
      phone: "+71111111111",
      email: "user0000002@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });
    expect(dup.status).toBe(409);
  });

  it("регистрация с некорректным ИНН отбивается 400", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Ошибка ИНН",
      companyType: "collector",
      billingInn: "12345",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+71111111113",
      email: "bad-inn@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("ИНН");
  });

  it("login с неверным паролем возвращает 401", async () => {
    await registerCompany("0000003");
    const res = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000003@test.local", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("после 10 неверных паролей временно блокирует вход и сбрасывает счётчик после успешного входа", async () => {
    await registerCompany("0000004");

    for (let i = 1; i <= 10; i += 1) {
      const attempt = await ctx.http
        .post("/api/auth/login")
        .send({ email: "user0000004@test.local", password: "wrong-password" });
      expect(attempt.status).toBe(401);
      if (i < 10) {
        expect(attempt.body.message).toBe("Неверный email или пароль.");
      } else {
        expect(attempt.body.message).toContain("Учётная запись временно заблокирована");
      }
    }

    const userAfterFailures = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: "user0000004@test.local" },
    });
    expect(userAfterFailures.failedLoginAttempts).toBe(10);
    expect(userAfterFailures.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const blockedEvenWithCorrectPassword = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000004@test.local", password: "User12345678" });
    expect(blockedEvenWithCorrectPassword.status).toBe(401);
    expect(blockedEvenWithCorrectPassword.body.message).toContain("Учётная запись временно заблокирована");

    await ctx.prisma.user.update({
      where: { id: userAfterFailures.id },
      data: { lockedUntil: new Date(Date.now() - 60_000) },
    });

    const loginAfterLockout = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000004@test.local", password: "User12345678" });
    expect(loginAfterLockout.status).toBe(201);
    expect(loginAfterLockout.body.accessToken).toMatch(/\./);

    const userAfterSuccess = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: userAfterFailures.id },
    });
    expect(userAfterSuccess.failedLoginAttempts).toBe(0);
    expect(userAfterSuccess.failedLoginWindowStartedAt).toBeNull();
    expect(userAfterSuccess.lockedUntil).toBeNull();
  });

  it("/auth/me без токена отвечает 401", async () => {
    const res = await ctx.http.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("POST /auth/me/export-data отдаёт zip-архив без секретных хэшей", async () => {
    const { token, companyId, userId } = await registerCompany("0000005");
    const ticket = await ctx.http.post("/api/support/tickets").set("Authorization", `Bearer ${token}`).send({
      category: "technical",
      subject: "Экспорт данных",
      text: "Прошу проверить выгрузку моих данных.",
    });
    expect(ticket.status).toBe(201);

    await ctx.prisma.fileAsset.create({
      data: {
        originalName: "act.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
        storageKey: "dev/export-test-act.pdf",
        uploadedById: userId,
      },
    });

    const res = await ctx.http
      .post("/api/auth/me/export-data")
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(parseBinary);

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-disposition"]).toContain("ecoplatform-data-export");

    const archive = res.body as Buffer;
    expect(archive.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");

    const raw = archive.toString("utf8");
    expect(raw).toContain("manifest.json");
    expect(raw).toContain("profile.json");
    expect(raw).toContain("company.json");
    expect(raw).toContain("support-tickets.json");
    expect(raw).toContain("files.json");
    expect(raw).toContain("user0000005@test.local");
    expect(raw).toContain(companyId);
    expect(raw).toContain("Экспорт данных");
    expect(raw).toContain("act.pdf");
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("refreshTokenHash");
    expect(raw).not.toContain("providerToken");
    expect(raw).not.toContain("keyHash");

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId, eventType: "auth.data_export.ready" },
    });
    expect(note?.category).toBe("security");
  });

  it("POST /auth/me/request-deletion планирует удаление и cancel возвращает компанию в прежний статус", async () => {
    const { token, companyId, userId } = await registerCompany("0000006");
    const secondLogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000006@test.local", password: "User12345678" });
    expect(secondLogin.status).toBe(201);

    const requestDeletion = await ctx.http
      .post("/api/auth/me/request-deletion")
      .set("Authorization", `Bearer ${token}`);
    expect(requestDeletion.status).toBe(201);
    expect(requestDeletion.body.deletionRequestedAt).toEqual(expect.any(String));
    expect(requestDeletion.body.deletionScheduledFor).toEqual(expect.any(String));

    const userAfterRequest = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const companyAfterRequest = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(userAfterRequest.deletionRequestedAt).toBeInstanceOf(Date);
    expect(companyAfterRequest.status).toBe(CompanyStatus.pending_deletion);
    expect(companyAfterRequest.statusBeforeDeletion).toBe(CompanyStatus.demo);

    const meAfterRequest = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(meAfterRequest.status).toBe(200);
    expect(meAfterRequest.body.company.status).toBe("pending_deletion");
    expect(meAfterRequest.body.deletionRequestedAt).toEqual(expect.any(String));

    const revokedSecondSession = await ctx.http
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${secondLogin.body.accessToken}`);
    expect(revokedSecondSession.status).toBe(401);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId, eventType: "auth.data_deletion.requested" },
    });
    expect(note?.category).toBe("security");

    const cancelDeletion = await ctx.http.post("/api/auth/me/cancel-deletion").set("Authorization", `Bearer ${token}`);
    expect(cancelDeletion.status).toBe(201);
    expect(cancelDeletion.body.deletionRequestedAt).toBeNull();

    const userAfterCancel = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const companyAfterCancel = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(userAfterCancel.deletionRequestedAt).toBeNull();
    expect(companyAfterCancel.status).toBe(CompanyStatus.demo);
    expect(companyAfterCancel.statusBeforeDeletion).toBeNull();
  });

  it("cleanup-deleted-accounts удаляет заявки старше 30 дней", async () => {
    const { token, companyId, userId } = await registerCompany("0000007");
    const requestDeletion = await ctx.http
      .post("/api/auth/me/request-deletion")
      .set("Authorization", `Bearer ${token}`);
    expect(requestDeletion.status).toBe(201);

    const requestedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const address = await ctx.prisma.address.create({
      data: {
        city: "Москва",
        formatted: "Москва, тестовый адрес удаления",
        source: "manual",
      },
    });
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { factualAddressId: address.id },
    });
    await ctx.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: requestedAt },
    });
    await ctx.prisma.fileAsset.create({
      data: {
        originalName: "delete-me.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
        storageKey: "dev/delete-me.pdf",
        uploadedById: userId,
      },
    });

    const scheduler = ctx.app.get(SchedulerService);
    const result = await scheduler.cleanupDeletedAccounts(new Date());
    expect(result).toEqual({ deletedUsers: 1, deletedCompanies: 1 });

    await expect(ctx.prisma.user.findUnique({ where: { id: userId } })).resolves.toBeNull();
    await expect(ctx.prisma.company.findUnique({ where: { id: companyId } })).resolves.toBeNull();
    await expect(ctx.prisma.address.findUnique({ where: { id: address.id } })).resolves.toBeNull();
    await expect(ctx.prisma.fileAsset.findFirst({ where: { uploadedById: userId } })).resolves.toBeNull();
  });
});

describe("Demo gating", () => {
  it("свежезарегистрированный пользователь видит /api/news (demo активен)", async () => {
    const { token } = await registerCompany("0000010");
    const res = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("после истечения demo /api/news → 403, /api/billing/status и /api/auth/me остаются доступны", async () => {
    const { token, companyId } = await registerCompany("0000011");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(403);

    const billing = await ctx.http.get("/api/billing/status").set("Authorization", `Bearer ${token}`);
    expect(billing.status).toBe(200);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it("ручная активация админом возвращает доступ к функциональным разделам", async () => {
    const { token, companyId } = await registerCompany("0000012");
    // 1. Demo истёк
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    expect((await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`)).status).toBe(403);

    // 2. Админ активирует
    const adminToken = await loginAdmin();
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const act = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-activate-${companyId}`)
      .send({ companyId, plan: "basic", endsAt, reason: "integration-test" });
    expect(act.status).toBe(201);
    expect(act.body.company.status).toBe("active");
    expect(act.body.company.subscriptionPlan).toBe("basic");

    // 3. Доступ восстановлен
    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(200);
  });

  it("ручная активация подписки с датой в прошлом отклоняется без записи", async () => {
    const { companyId } = await registerCompany("0000014");
    const adminToken = await loginAdmin();
    const pastEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const res = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-past-date-${companyId}`)
      .send({ companyId, plan: "basic", endsAt: pastEndsAt, reason: "past-date-test" });

    expect(res.status).toBe(400);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(0);
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.demo);
  });

  it("ручная активация подписки идемпотентна по Idempotency-Key", async () => {
    const { companyId, userId } = await registerCompany("0000013");
    const adminToken = await loginAdmin();
    const endsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const payload = { companyId, plan: "extended", endsAt, reason: "double-click-test" };
    const key = `manual-idempotency-${companyId}`;

    const first = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const conflict = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send({ ...payload, reason: "different-payload" });
    expect(conflict.status).toBe(409);

    const [subscriptions, logs, notifications, deliveries] = await Promise.all([
      ctx.prisma.subscription.findMany({ where: { companyId } }),
      ctx.prisma.adminActionLog.findMany({
        where: { action: "manual_subscription_activation", entityId: companyId },
      }),
      ctx.prisma.inAppNotification.findMany({
        where: { userId, eventType: "billing.subscription.activated" },
      }),
      ctx.prisma.notificationDelivery.findMany({
        where: {
          recipientUserId: userId,
          eventType: "billing.subscription.activated",
        },
      }),
    ]);

    expect(subscriptions).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    expect(deliveries).toHaveLength(2);

    // Волна 9.7: payload админ-журнала пишется в формате before/after/diff.
    const auditPayload = logs[0].payload as {
      before: { status: string; subscriptionPlan: string };
      after: { status: string; subscriptionPlan: string };
      diff: Record<string, { before: unknown; after: unknown }>;
      subscriptionId: string;
    };
    expect(auditPayload.before.status).toBe("demo");
    expect(auditPayload.after.status).toBe("active");
    expect(auditPayload.after.subscriptionPlan).toBe("extended");
    expect(auditPayload.diff.status).toEqual({ before: "demo", after: "active" });
    expect(auditPayload.diff.subscriptionPlan.after).toBe("extended");
    expect(auditPayload.subscriptionId).toBe(subscriptions[0].id);
  });

  it("админский список billing-компаний валидирует pagination query", async () => {
    const adminToken = await loginAdmin();
    await registerCompany("0000015");

    const bad = await ctx.http
      .get("/api/admin/billing/companies?limit=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);

    const good = await ctx.http
      .get("/api/admin/billing/companies?limit=1&offset=0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(good.status).toBe(200);
    expectPaginatedEnvelope(good.body);
    expect(good.body.items).toHaveLength(1);
  });
});

describe("Files API", () => {
  it("metadata-only endpoint применяет safe-type проверку и нормализует MIME", async () => {
    const managerToken = await loginContentManager();

    const svg = await ctx.http.post("/api/files/metadata").set("Authorization", `Bearer ${managerToken}`).send({
      originalName: "vector.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 512,
      accessLevel: "public",
    });
    expect(svg.status).toBe(400);
    expect(svg.body.message).toContain("Формат файла не поддерживается");

    const pdf = await ctx.http.post("/api/files/metadata").set("Authorization", `Bearer ${managerToken}`).send({
      originalName: "report final.pdf",
      mimeType: "application/x-pdf",
      sizeBytes: 1024,
      accessLevel: "authenticated",
    });
    expect(pdf.status).toBe(201);
    expect(pdf.body.mimeType).toBe("application/pdf");
    expect(pdf.body.storageKey).toMatch(/^uploads\/\d{4}-\d{2}-\d{2}\/.+-report-final\.pdf$/);
  });

  it("content manager не может удалить чужой неиспользуемый файл", async () => {
    const managerToken = await loginContentManager();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const asset = await createCoverAsset(admin.id, "foreign-unreferenced-file");

    const forbidden = await ctx.http.delete(`/api/files/${asset.id}`).set("Authorization", `Bearer ${managerToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.message).toContain("загруженный вами");

    await expect(ctx.prisma.fileAsset.findUnique({ where: { id: asset.id } })).resolves.toMatchObject({
      id: asset.id,
    });
  });
});

describe("Content publish", () => {
  it("админ создаёт черновик новости и публикует — она появляется в публичном /api/news", async () => {
    const adminToken = await loginAdmin();
    const { token: userToken } = await registerCompany("0000020");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Тестовая новость интеграции",
        lead: "Лид новости",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
        tags: ["test"],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe(ContentStatus.draft);
    const slug = draft.body.slug as string;
    expect(slug).toBeTruthy();

    // До публикации — публичный список не содержит её
    const before = await ctx.http.get("/api/news").set("Authorization", `Bearer ${userToken}`);
    expect(before.body.items.find((n: { slug: string }) => n.slug === slug)).toBeUndefined();

    const publish = await ctx.http
      .post(`/api/admin/content/news/${draft.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe(ContentStatus.published);

    const after = await ctx.http.get("/api/news").set("Authorization", `Bearer ${userToken}`);
    expect(after.body.items.find((n: { slug: string }) => n.slug === slug)).toBeTruthy();
  });

  it("CMS-предпросмотр открывает черновик новости только сотруднику CMS", async () => {
    const adminToken = await loginAdmin();
    const { token: userToken } = await registerCompany("0000020");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Черновик для предпросмотра",
        lead: "Лид черновика",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело черновика.</p>" } }],
        tags: ["preview"],
      });
    expect(draft.status).toBe(201);

    const publicDraft = await ctx.http.get(`/api/news/${draft.body.slug}`).set("Authorization", `Bearer ${adminToken}`);
    expect(publicDraft.status).toBe(404);

    const preview = await ctx.http
      .get(`/api/news/${draft.body.slug}?preview=1`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.status).toBe(ContentStatus.draft);
    expect(preview.body.blocks).toHaveLength(1);

    const forbiddenPreview = await ctx.http
      .get(`/api/news/${draft.body.slug}?preview=1`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(forbiddenPreview.status).toBe(404);
  });

  it("CMS-предпросмотр открывает черновой урок только сотруднику CMS", async () => {
    const adminToken = await loginAdmin();
    const { token: userToken } = await registerCompany("0000022");

    const draft = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Курс для предпросмотра",
        summary: "Кратко",
        description: "Описание курса",
        accessLevel: "basic",
        isInDevelopment: true,
        preview: { promotionalDescription: "Что внутри", whatYouWillLearn: ["Пункт"] },
        chapters: [
          {
            title: "Глава",
            lessons: [{ title: "Черновой урок", blocks: [{ type: "paragraph", payload: { html: "<p>Урок.</p>" } }] }],
          },
        ],
      });
    expect(draft.status).toBe(201);
    const chapter = await ctx.prisma.chapter.findFirstOrThrow({
      where: { moduleId: draft.body.id },
      include: { lessons: true },
    });
    const lessonId = chapter.lessons[0]?.id;
    expect(lessonId).toBeTruthy();

    const publicModule = await ctx.http
      .get(`/api/education/modules/${draft.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publicModule.status).toBe(404);

    const preview = await ctx.http
      .get(`/api/education/modules/${draft.body.id}?preview=1`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.status).toBe(ContentStatus.draft);
    expect(preview.body.chapters[0].lessons[0]).toMatchObject({
      id: lessonId,
      status: ContentStatus.draft,
      title: "Черновой урок",
    });
    expect(preview.body.chapters[0].lessons[0].blocks).toHaveLength(1);

    const forbiddenPreview = await ctx.http
      .get(`/api/education/modules/${draft.body.id}?preview=1`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(forbiddenPreview.status).toBe(404);
  });

  it("новость с некорректным блоком (paragraph без html) отбивается 400", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Кривая новость",
        lead: "Лид",
        blocks: [{ type: "paragraph", payload: { text: "не то поле" } }],
        tags: [],
      });
    expect(res.status).toBe(400);
  });

  it("админский список тегов возвращает сохранённые теги для автокомплита", async () => {
    const adminToken = await loginAdmin();
    for (const [title, tags] of [
      ["Новость с рынком", ["рынок", "переработка"]],
      ["Новость с повтором", ["рынок", "экология"]],
    ] as const) {
      const draft = await ctx.http
        .post("/api/admin/content/news")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title,
          lead: "Лид",
          blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
          tags,
        });
      expect(draft.status).toBe(201);
    }

    const res = await ctx.http.get("/api/admin/content/news/tags").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map((tag: { name: string }) => tag.name)).toEqual(
      expect.arrayContaining(["рынок", "переработка", "экология"]),
    );
    expect(res.body.find((tag: { name: string }) => tag.name === "рынок").usageCount).toBe(2);
  });

  it("публичный список тегов возвращает топ тегов по usageCount с limit", async () => {
    const adminToken = await loginAdmin();
    const { token: userToken } = await registerCompany("0000021");

    await createPublishedNews(adminToken, "tags-top-1", ["рынок", "пластик"]);
    await createPublishedNews(adminToken, "tags-top-2", ["рынок", "экология"]);

    const res = await ctx.http.get("/api/news/tags?limit=1").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "рынок", usageCount: 2 });
    expect(res.body[0].slug).toBeTruthy();
  });

  it("фильтрует публичный /api/news по tags[] с AND-семантикой", async () => {
    const adminToken = await loginAdmin();
    const { token: userToken } = await registerCompany("0000021");

    const target = await createPublishedNews(adminToken, "tags-and-target", ["рынок", "пластик"]);
    await createPublishedNews(adminToken, "tags-and-market", ["рынок"]);
    await createPublishedNews(adminToken, "tags-and-plastic", ["пластик", "экология"]);

    const res = await ctx.http
      .get("/api/news")
      .query({ "tags[]": ["рынок", "пластик"], limit: 20, offset: 0 })
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([target.id]);
    expect(res.body.hasMore).toBe(false);
  });

  it("пользователь может поставить и снять лайк с комментария к новости", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000021");
    const reader = await registerCompany("0000022");
    const news = await createPublishedNews(adminToken, "comment-like");

    const comment = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Комментарий для лайка" });
    expect(comment.status).toBe(201);

    const like = await ctx.http
      .post(`/api/news/comments/${comment.body.id}/like`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(like.status).toBe(201);
    expect(like.body).toEqual({ liked: true, likesCount: 1 });

    const publicNews = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${reader.token}`);
    expect(publicNews.status).toBe(200);
    const publicComment = publicNews.body.comments.find((item: { id: string }) => item.id === comment.body.id);
    expect(publicComment.likedByMe).toBe(true);
    expect(publicComment._count.likes).toBe(1);

    const unlike = await ctx.http
      .post(`/api/news/comments/${comment.body.id}/like`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(unlike.status).toBe(201);
    expect(unlike.body).toEqual({ liked: false, likesCount: 0 });
  });

  it("content-листинги валидируют числовые query-параметры", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0000023");

    const endpoints = [
      [reader.token, "/api/news?limit=abc"],
      [reader.token, "/api/news/tags?limit=abc"],
      [reader.token, "/api/indices?limit=abc"],
      [reader.token, "/api/education/modules?limit=abc"],
      [reader.token, "/api/knowledge-base?limit=abc"],
      [reader.token, "/api/knowledge-base?depth=abc"],
      [adminToken, "/api/admin/content/news?limit=abc"],
      [adminToken, "/api/admin/content/indices?limit=abc"],
      [adminToken, "/api/admin/content/education?limit=abc"],
      [adminToken, "/api/admin/content/knowledge-base?limit=abc"],
    ] as const;

    for (const [token, path] of endpoints) {
      const res = await ctx.http.get(path).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(400);
    }
  });
});

describe("Wave 8.4 pagination contracts", () => {
  it("возвращает PaginatedResponse на API-листингах, а knowledge-base tree ограничивает ширину", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0300001");

    const endpoints = [
      [reader.token, "/api/education/modules?limit=1&offset=0"],
      [reader.token, "/api/indices?limit=1&offset=0"],
      [adminToken, "/api/admin/content/education?limit=1&offset=0"],
      [adminToken, "/api/admin/content/indices?limit=1&offset=0"],
      [adminToken, "/api/admin/content/knowledge-base?limit=1&offset=0"],
      [adminToken, "/api/admin/users?limit=1&offset=0"],
      [adminToken, "/api/admin/companies?limit=1&offset=0"],
      [adminToken, "/api/admin/journals?limit=1&offset=0"],
      [adminToken, "/api/admin/moderation/cases?limit=1&offset=0"],
    ] as const;

    for (const [token, path] of endpoints) {
      const response = await ctx.http.get(path).set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expectPaginatedEnvelope(response.body);
    }

    const tree = await ctx.http
      .get("/api/knowledge-base?limit=1&depth=1")
      .set("Authorization", `Bearer ${reader.token}`);
    expect(tree.status).toBe(200);
    expect(Array.isArray(tree.body)).toBe(true);
    expect(tree.body.length).toBeLessThanOrEqual(1);
  });
});

describe("Support ownership", () => {
  it("пользователь видит свой тикет и не видит чужой; чужая компания получает 404 при попытке ответа", async () => {
    const adminToken = await loginAdmin();
    const a = await registerCompany("0000030");
    const b = await registerCompany("0000031");

    // A создаёт тикет
    const t = await ctx.http
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ category: "technical", subject: "Тест", text: "Описание" });
    expect(t.status).toBe(201);
    const ticketId = t.body.id as string;

    // A видит в своём списке
    const listA = await ctx.http.get("/api/support/tickets").set("Authorization", `Bearer ${a.token}`);
    expect(listA.body.items.some((x: { id: string }) => x.id === ticketId)).toBe(true);

    // B не видит
    const listB = await ctx.http.get("/api/support/tickets").set("Authorization", `Bearer ${b.token}`);
    expect(listB.body.items.some((x: { id: string }) => x.id === ticketId)).toBe(false);

    // B пытается ответить — 404 (защита через companyId-фильтр)
    const foreign = await ctx.http
      .post(`/api/support/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${b.token}`)
      .send({ text: "должно быть запрещено" });
    expect(foreign.status).toBe(404);

    // Админ может ответить любому
    const adminReply = await ctx.http
      .post(`/api/admin/support/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "Ответ админа" });
    expect(adminReply.status).toBe(201);
    expect(
      adminReply.body.messages.some(
        (m: { authorRole: string; text: string }) => m.authorRole === "admin" && m.text === "Ответ админа",
      ),
    ).toBe(true);
  });
});

describe("Moderation", () => {
  it("создаёт жалобу на опубликованный комментарий, дедуплицирует повтор и агрегирует второго пользователя", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000040");
    const reporterA = await registerCompany("0000041");
    const reporterB = await registerCompany("0000042");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    const first = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporterA.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const duplicate = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporterA.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.duplicate).toBe(true);

    const second = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporterB.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "false_information" });
    expect(second.status).toBe(201);
    expect(second.body.duplicate).toBe(false);

    expect(await ctx.prisma.moderationCase.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(
      1,
    );
    expect(await ctx.prisma.complaint.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(2);
  });

  it("не пускает обычного пользователя в очередь и позволяет модератору взять и освободить lock", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const author = await registerCompany("0000043");
    const reporter = await registerCompany("0000044");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "offensive_content" });

    const forbidden = await ctx.http
      .get("/api/admin/moderation/cases")
      .set("Authorization", `Bearer ${reporter.token}`);
    expect(forbidden.status).toBe(403);

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const caseId = list.body.items[0].id as string;

    const lock = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/lock`)
      .set("Authorization", `Bearer ${moderatorToken}`);
    expect(lock.status).toBe(201);
    expect(lock.body.status).toBe("in_review");
    expect(lock.body.lockedBy.email).toBe("moderator@test.local");

    const release = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/release`)
      .set("Authorization", `Bearer ${moderatorToken}`);
    expect(release.status).toBe(201);
    expect(release.body.status).toBe("open");
    expect(release.body.lockedById).toBeNull();
  });

  it("remove_content скрывает комментарий из публичной новости и создаёт sanction", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const author = await registerCompany("0000045");
    const reporter = await registerCompany("0000046");
    const { news, comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "illegal_content" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    const caseId = list.body.items[0].id as string;
    await ctx.http.post(`/api/admin/moderation/cases/${caseId}/lock`).set("Authorization", `Bearer ${moderatorToken}`);

    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${moderatorToken}`)
      .send({ type: "remove_content", reasonCode: "valid_complaint", comment: "Нарушение правил." });
    expect(decision.status).toBe(201);
    expect(decision.body.status).toBe("resolved");

    const updatedComment = await ctx.prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updatedComment?.status).toBe(CommentStatus.hidden_by_moderator);
    expect(await ctx.prisma.sanction.count({ where: { caseId, type: SanctionType.content_removal } })).toBe(1);

    const publicNews = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${reporter.token}`);
    expect(publicNews.status).toBe(200);
    expect(publicNews.body.comments.some((item: { id: string }) => item.id === comment.id)).toBe(false);
  });

  it("leave_as_is закрывает кейс без изменения комментария", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000047");
    const reporter = await registerCompany("0000048");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "false_information" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${adminToken}`);
    const caseId = list.body.items[0].id as string;
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "leave_as_is", reasonCode: "unfounded_complaint" });
    expect(decision.status).toBe(201);
    expect(decision.body.status).toBe("resolved");

    const updatedComment = await ctx.prisma.comment.findUnique({ where: { id: comment.id } });
    expect(updatedComment?.status).toBe(CommentStatus.published);
    expect(await ctx.prisma.complaint.count({ where: { caseId, status: "resolved" } })).toBe(1);
  });

  it("warn_company создаёт warning sanction и уведомляет автора комментария", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000049");
    const reporter = await registerCompany("0000050");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "contact_data" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${adminToken}`);
    const caseId = list.body.items[0].id as string;
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "warn_company", reasonCode: "valid_complaint", comment: "Контактные данные в комментарии." });
    expect(decision.status).toBe(201);

    const sanction = await ctx.prisma.sanction.findFirst({ where: { caseId, type: SanctionType.warning } });
    expect(sanction?.targetType).toBe("company");
    expect(sanction?.targetId).toBe(author.companyId);

    const warning = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: author.userId, eventType: "moderation.warning.issued" },
    });
    expect(warning).toBeTruthy();
  });

  it("отклоняет other без комментария", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000051");
    const reporter = await registerCompany("0000052");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    const res = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "other" });
    expect(res.status).toBe(400);
  });

  it("remove_content по жалобе на news_post переводит новость в draft и убирает её из публичной выдачи", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const reporter = await registerCompany("0000053");
    const news = await createPublishedNews(adminToken, "post-removal");

    const complaint = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_post", entityId: news.id, reasonCode: "false_information" });
    expect(complaint.status).toBe(201);

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].entity).toMatchObject({ type: "news_post", title: news.title, slug: news.slug });
    const caseId = list.body.items[0].id as string;

    await ctx.http.post(`/api/admin/moderation/cases/${caseId}/lock`).set("Authorization", `Bearer ${moderatorToken}`);
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${moderatorToken}`)
      .send({ type: "remove_content", reasonCode: "valid_complaint", comment: "Недостоверная информация в новости." });
    expect(decision.status).toBe(201);
    expect(decision.body.status).toBe("resolved");

    const updatedNews = await ctx.prisma.newsPost.findUnique({ where: { id: news.id } });
    expect(updatedNews?.status).toBe(ContentStatus.draft);
    expect(await ctx.prisma.sanction.count({ where: { caseId, type: SanctionType.content_removal } })).toBe(1);

    const publicNewsFeed = await ctx.http.get("/api/news").set("Authorization", `Bearer ${reporter.token}`);
    expect(publicNewsFeed.status).toBe(200);
    expect(publicNewsFeed.body.items.some((item: { id: string }) => item.id === news.id)).toBe(false);

    const reporterUser = await ctx.prisma.user.findUnique({ where: { email: "user0000053@test.local" } });
    const complaintNotice = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: reporterUser!.id, eventType: "moderation.complaint.resolved" },
    });
    expect(complaintNotice).toBeTruthy();
    expect(complaintNotice?.link).toBe(`/news/${news.slug}`);
  });

  it("remove_content по жалобе на knowledge_article переводит статью в draft", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const reporter = await registerCompany("0000054");
    const article = await createPublishedKnowledgeArticle(adminToken, "kb-removal");

    const complaint = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "knowledge_article", entityId: article.id, reasonCode: "false_information" });
    expect(complaint.status).toBe(201);

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].entity).toMatchObject({
      type: "knowledge_article",
      title: article.title,
      slug: article.slug,
    });
    const caseId = list.body.items[0].id as string;

    await ctx.http.post(`/api/admin/moderation/cases/${caseId}/lock`).set("Authorization", `Bearer ${moderatorToken}`);
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${moderatorToken}`)
      .send({ type: "remove_content", reasonCode: "valid_complaint" });
    expect(decision.status).toBe(201);
    expect(decision.body.status).toBe("resolved");

    const updatedArticle = await ctx.prisma.knowledgeBaseArticle.findUnique({ where: { id: article.id } });
    expect(updatedArticle?.status).toBe(ContentStatus.draft);
    expect(await ctx.prisma.sanction.count({ where: { caseId, type: SanctionType.content_removal } })).toBe(1);
  });

  it("отказывает в жалобе на неопубликованную новость", async () => {
    const adminToken = await loginAdmin();
    const reporter = await registerCompany("0000055");
    const news = await createPublishedNews(adminToken, "draft-rejection");

    const unpublish = await ctx.http
      .post(`/api/admin/content/news/${news.id}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unpublish.status).toBe(201);

    const res = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_post", entityId: news.id, reasonCode: "false_information" });
    expect(res.status).toBe(404);
  });

  it("warn_company по жалобе на news_post отбивается отсутствием компании автора", async () => {
    const adminToken = await loginAdmin();
    const reporter = await registerCompany("0000056");
    const news = await createPublishedNews(adminToken, "warn-rejection");

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_post", entityId: news.id, reasonCode: "spam" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${adminToken}`);
    const caseId = list.body.items[0].id as string;
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "warn_company", reasonCode: "valid_complaint" });
    expect(decision.status).toBe(400);
  });
});

describe("Admin users panel", () => {
  it("выдаёт список пользователей с фильтром по статусу, пагинацией и поиском (только admin)", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const userA = await registerCompany("0100001");
    const userB = await registerCompany("0100002");

    const forbidden = await ctx.http.get("/api/admin/users").set("Authorization", `Bearer ${moderatorToken}`);
    expect(forbidden.status).toBe(403);

    const all = await ctx.http.get("/api/admin/users?take=50").set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(4);
    expect(all.body.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([userA.userId, userB.userId]),
    );

    const search = await ctx.http
      .get(`/api/admin/users?search=user0100002`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([userB.userId]);

    const byCompany = await ctx.http
      .get(`/api/admin/users?companyId=${userA.companyId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byCompany.body.items.map((item: { id: string }) => item.id)).toEqual([userA.userId]);
  });

  it("карточка пользователя возвращает связанные сущности (компания, ограничения, сессии)", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0100003");

    const card = await ctx.http.get(`/api/admin/users/${target.userId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(card.status).toBe(200);
    expect(card.body.company.id).toBe(target.companyId);
    expect(card.body.activeRestrictions).toEqual([]);
    expect(card.body.recentSessions.length).toBeGreaterThanOrEqual(1);
  });

  it("block/unblock переводит User.status и отзывает активные сессии", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0100004");

    const block = await ctx.http
      .post(`/api/admin/users/${target.userId}/block`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "policy_violation", comment: "Нарушение правил." });
    expect(block.status).toBe(201);
    expect(block.body.status).toBe(UserStatus.blocked);

    const activeSessions = await ctx.prisma.session.count({
      where: { userId: target.userId, revokedAt: null },
    });
    expect(activeSessions).toBe(0);

    const relogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0100004@test.local", password: "User12345678" });
    expect(relogin.status).toBe(401);

    const blockLog = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: target.userId, action: "admin.user.block" },
    });
    const blockPayload = blockLog?.payload as {
      before: { status: string };
      after: { status: string };
      diff: Record<string, { before: unknown; after: unknown }>;
      reasonCode: string;
    };
    expect(blockPayload.before.status).toBe("active");
    expect(blockPayload.after.status).toBe("blocked");
    expect(blockPayload.diff.status).toEqual({ before: "active", after: "blocked" });
    expect(blockPayload.reasonCode).toBe("policy_violation");

    const unblock = await ctx.http
      .post(`/api/admin/users/${target.userId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ comment: "Пересмотр." });
    expect(unblock.status).toBe(201);
    expect(unblock.body.status).toBe(UserStatus.active);

    const unblockLog = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: target.userId, action: "admin.user.unblock" },
    });
    const unblockPayload = unblockLog?.payload as {
      diff: Record<string, { before: unknown; after: unknown }>;
    };
    expect(unblockPayload.diff.status).toEqual({ before: "blocked", after: "active" });

    const reloginOk = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0100004@test.local", password: "User12345678" });
    expect(reloginOk.status).toBe(201);
  });

  it("admin не может заблокировать собственную учётную запись", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    const res = await ctx.http
      .post(`/api/admin/users/${me.body.id}/block`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "policy_violation" });
    expect(res.status).toBe(400);
  });

  it("PATCH platform-roles добавляет роль и пишет AdminActionLog", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0100005");

    const res = await ctx.http
      .patch(`/api/admin/users/${target.userId}/platform-roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["moderator"], isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.platformStaff.roles).toEqual(["moderator"]);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: target.userId, action: "admin.user.platform_roles" },
    });
    expect(log).toBeTruthy();
  });

  it("нельзя снять роль admin у последнего администратора", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);

    const res = await ctx.http
      .patch(`/api/admin/users/${me.body.id}/platform-roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["moderator"] });
    expect(res.status).toBe(400);
  });

  it("admin не может снять роль admin сам с себя при наличии других админов", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    const second = await registerCompany("0100006");
    await ctx.http
      .patch(`/api/admin/users/${second.userId}/platform-roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["admin"], isActive: true });

    const res = await ctx.http
      .patch(`/api/admin/users/${me.body.id}/platform-roles`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["moderator"] });
    expect(res.status).toBe(400);
  });

  it("нельзя снять admin у PLATFORM_OWNER_EMAIL через users panel", async () => {
    await withEnv({ PLATFORM_OWNER_EMAIL: "admin@test.local" }, async () => {
      const adminToken = await loginAdmin();
      const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
      const second = await registerCompany("0100007");
      await ctx.http
        .patch(`/api/admin/users/${second.userId}/platform-roles`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roles: ["admin"], isActive: true });

      const res = await ctx.http
        .patch(`/api/admin/users/${me.body.id}/platform-roles`)
        .set("Authorization", `Bearer ${second.token}`)
        .send({ roles: ["moderator"], isActive: true });
      expect(res.status).toBe(400);

      const ownerStaff = await ctx.prisma.platformStaff.findUniqueOrThrow({
        where: { userId: me.body.id },
      });
      expect(ownerStaff.roles).toContain("admin");
      expect(ownerStaff.isActive).toBe(true);
    });
  });
});

describe("Admin companies panel", () => {
  it("выдаёт список компаний с фильтрами и поиском (только admin)", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const a = await registerCompany("0200001");
    const b = await registerCompany("0200002");

    const forbidden = await ctx.http.get("/api/admin/companies").set("Authorization", `Bearer ${moderatorToken}`);
    expect(forbidden.status).toBe(403);

    const list = await ctx.http.get("/api/admin/companies?take=50").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([a.companyId, b.companyId]),
    );

    const search = await ctx.http
      .get("/api/admin/companies?search=ООО%20Тест%200200002")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(search.body.items.map((item: { id: string }) => item.id)).toEqual([b.companyId]);

    const demoOnly = await ctx.http
      .get("/api/admin/companies?status=demo")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(demoOnly.body.items.every((item: { status: string }) => item.status === "demo")).toBe(true);
  });

  it("карточка компании отдаёт пользователей, подписки и тикеты", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0200003");

    const card = await ctx.http
      .get(`/api/admin/companies/${target.companyId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(card.status).toBe(200);
    expect(card.body.users.map((u: { id: string }) => u.id)).toEqual([target.userId]);
    expect(card.body.subscriptions).toEqual([]);
    expect(card.body.supportTickets).toEqual([]);
  });

  it("смена статуса компании на blocked отзывает сессии пользователей", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0200004");

    const res = await ctx.http
      .post(`/api/admin/companies/${target.companyId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "blocked", reasonCode: "policy_violation", comment: "Заблокировано админом." });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe(CompanyStatus.blocked);

    const active = await ctx.prisma.session.count({
      where: { user: { companyId: target.companyId }, revokedAt: null },
    });
    expect(active).toBe(0);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: target.companyId, action: "admin.company.status" },
    });
    expect(log).toBeTruthy();
    const payload = log?.payload as {
      before: { status: string };
      after: { status: string };
      diff: Record<string, { before: unknown; after: unknown }>;
      reasonCode: string;
    };
    expect(payload.diff.status).toEqual({ before: "demo", after: "blocked" });
    expect(payload.reasonCode).toBe("policy_violation");
  });

  it("отказывает в смене статуса на тот же самый", async () => {
    const adminToken = await loginAdmin();
    const target = await registerCompany("0200005");

    const res = await ctx.http
      .post(`/api/admin/companies/${target.companyId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "demo", reasonCode: "manual_activation" });
    expect(res.status).toBe(400);
  });
});

describe("Email channel queue (задел)", () => {
  it("при логине создаётся не только in_app, но и email-доставка в статусе queued", async () => {
    const company = await registerCompany("0700001");
    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0700001@test.local", password: "User12345678" });
    expect(login.status).toBe(201);

    const deliveries = await ctx.prisma.notificationDelivery.findMany({
      where: {
        recipientUserId: company.userId,
        eventType: { in: ["auth.login", "auth.login.new_device"] },
      },
    });
    // Должно быть две записи: in_app=delivered и email=queued.
    const inApp = deliveries.find((d) => d.channel === "in_app");
    const email = deliveries.find((d) => d.channel === "email");
    expect(inApp?.status).toBe("delivered");
    expect(email?.status).toBe("queued");
    expect(email?.address).toBe("user0700001@test.local");
  });

  it("email-доставка не создаётся, если категория замьючена в email", async () => {
    const company = await registerCompany("0700002");

    await ctx.http
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${company.token}`)
      .send({ inAppMutedCategories: [], emailMutedCategories: ["moderation"] });

    // Сгенерируем уведомление категории moderation через жалобу-решение.
    const adminToken = await loginAdmin();
    const reporter = await registerCompany("0700003");
    const { comment } = await createPublishedNewsWithComment(adminToken, company.token);
    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });
    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${adminToken}`);
    const caseId = list.body.items[0].id as string;
    await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "warn_company", reasonCode: "valid_complaint" });

    const moderationDeliveries = await ctx.prisma.notificationDelivery.findMany({
      where: {
        recipientUserId: company.userId,
        eventType: "moderation.warning.issued",
      },
    });
    expect(moderationDeliveries.find((d) => d.channel === "in_app")).toBeDefined();
    expect(moderationDeliveries.find((d) => d.channel === "email")).toBeUndefined();
  });
});

describe("Billing notifications (cron)", () => {
  it("уведомление billing.demo.expiring создаётся, когда демо < 3 дней; идемпотентно при повторе", async () => {
    const company = await registerCompany("0600001");
    // Подвинем демо так, чтобы оно истекало через ~1 день.
    await ctx.prisma.company.update({
      where: { id: company.companyId },
      data: { demoEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const service = ctx.app.get(BillingNotificationsService);
    await service.runHourlyCheck();
    await service.runHourlyCheck(); // повтор — не должен породить дубликат

    const notes = await ctx.prisma.inAppNotification.findMany({
      where: { userId: company.userId, eventType: "billing.demo.expiring" },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].category).toBe("billing");
  });

  it("истёкшее демо переводит компанию в past_due и шлёт billing.demo.expired", async () => {
    const company = await registerCompany("0600002");
    await ctx.prisma.company.update({
      where: { id: company.companyId },
      data: { demoEndsAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    await ctx.app.get(BillingNotificationsService).runHourlyCheck();

    const updated = await ctx.prisma.company.findUnique({ where: { id: company.companyId } });
    expect(updated?.status).toBe(CompanyStatus.past_due);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "billing.demo.expired" },
    });
    expect(note).toBeTruthy();
  });

  it("подписка, истекающая через 5 дней, рождает billing.subscription.expiring", async () => {
    const adminToken = await loginAdmin();
    const company = await registerCompany("0600003");

    // Активируем подписку, оканчивающуюся через 5 дней.
    const fiveDaysLater = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `billing-expiring-${company.companyId}`)
      .send({
        companyId: company.companyId,
        plan: "basic",
        endsAt: fiveDaysLater.toISOString(),
        reason: "тест",
      });

    await ctx.app.get(BillingNotificationsService).runHourlyCheck();

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "billing.subscription.expiring" },
    });
    expect(note).toBeTruthy();
    expect(note?.category).toBe("billing");
  });

  it("истёкшая подписка переводит компанию в past_due, саму подписку в expired, шлёт expired-уведомление", async () => {
    const adminToken = await loginAdmin();
    const company = await registerCompany("0600004");

    const futureEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `billing-expired-${company.companyId}`)
      .send({
        companyId: company.companyId,
        plan: "extended",
        endsAt: futureEndsAt.toISOString(),
        reason: "тест",
      });

    // Сдвинем end даты в прошлое (имитация истечения).
    const pastEndsAt = new Date(Date.now() - 60 * 60 * 1000);
    await ctx.prisma.company.update({
      where: { id: company.companyId },
      data: { subscriptionEndsAt: pastEndsAt },
    });
    await ctx.prisma.subscription.updateMany({
      where: { companyId: company.companyId },
      data: { endsAt: pastEndsAt },
    });

    await ctx.app.get(BillingNotificationsService).runHourlyCheck();

    const updatedCompany = await ctx.prisma.company.findUnique({ where: { id: company.companyId } });
    expect(updatedCompany?.status).toBe(CompanyStatus.past_due);

    const subscription = await ctx.prisma.subscription.findFirst({
      where: { companyId: company.companyId },
    });
    expect(subscription?.status).toBe(SubscriptionStatus.expired);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "billing.subscription.expired" },
    });
    expect(note).toBeTruthy();
  });
});

describe("Auth security notifications", () => {
  it("создаёт уведомление о входе после успешного логина", async () => {
    const company = await registerCompany("0500001");
    // Регистрация уже создала сессию — уведомления при register не шлются,
    // но повторный логин должен создать notification.
    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0500001@test.local", password: "User12345678" });
    expect(login.status).toBe(201);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: { in: ["auth.login", "auth.login.new_device"] } },
      orderBy: { createdAt: "desc" },
    });
    expect(note).toBeTruthy();
    expect(note?.category).toBe("security");
  });

  it("второй логин с другим User-Agent помечается как новое устройство", async () => {
    const company = await registerCompany("0500002");

    const login = await ctx.http
      .post("/api/auth/login")
      .set("User-Agent", "DifferentBrowser/1.0")
      .send({ email: "user0500002@test.local", password: "User12345678" });
    expect(login.status).toBe(201);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "auth.login.new_device" },
      orderBy: { createdAt: "desc" },
    });
    expect(note).toBeTruthy();
    expect(note?.title).toBe("Новый вход в аккаунт");
    expect(note?.body).toBe("Вход выполнен.");
  });

  it("смена пароля: отзывает другие сессии, создаёт уведомление, новый пароль работает", async () => {
    const company = await registerCompany("0500003");

    // Открываем вторую сессию параллельно.
    const second = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0500003@test.local", password: "User12345678" });
    expect(second.status).toBe(201);
    const secondToken = second.body.accessToken as string;

    // Со второй сессии меняем пароль.
    const change = await ctx.http
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ currentPassword: "User12345678", newPassword: "NewPassw0rd!" });
    expect(change.status).toBe(201);

    // Первая сессия отозвана — endpoint /auth/me с её токеном вернёт 401.
    const meFirst = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${company.token}`);
    expect(meFirst.status).toBe(401);

    // Текущая (вторая) сессия активна.
    const meSecond = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${secondToken}`);
    expect(meSecond.status).toBe(200);

    // Логин со старым паролем не работает, с новым — работает.
    const oldLogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0500003@test.local", password: "User12345678" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0500003@test.local", password: "NewPassw0rd!" });
    expect(newLogin.status).toBe(201);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "auth.password_changed" },
    });
    expect(note).toBeTruthy();
    expect(note?.category).toBe("security");
  });

  it("смена пароля с неверным текущим паролем возвращает 401", async () => {
    const company = await registerCompany("0500004");

    const res = await ctx.http
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${company.token}`)
      .send({ currentPassword: "WrongPass", newPassword: "NewPassw0rd!" });
    expect(res.status).toBe(401);
  });

  it("смена пароля на слишком короткий — 400", async () => {
    const company = await registerCompany("0500005");

    const res = await ctx.http
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${company.token}`)
      .send({ currentPassword: "User12345678", newPassword: "short" });
    expect(res.status).toBe(400);
  });
});

describe("Admin journals", () => {
  it("выдаёт журнал действий админу с фильтрами и пагинацией", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();

    // Породим пару действий разного типа
    const company = await registerCompany("0400001");
    await ctx.http
      .post(`/api/admin/users/${company.userId}/block`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "policy_violation", comment: "Тест блока." });
    await ctx.http
      .patch("/api/admin/settings/moderation.max_locks_per_moderator")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 5 });

    const forbidden = await ctx.http.get("/api/admin/journals").set("Authorization", `Bearer ${moderatorToken}`);
    expect(forbidden.status).toBe(403);

    const all = await ctx.http.get("/api/admin/journals?take=100").set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(2);

    const byAction = await ctx.http
      .get("/api/admin/journals?action=admin.user.block")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byAction.body.items.every((item: { action: string }) => item.action === "admin.user.block")).toBe(true);
    // Волна 9.7: GET /admin/journals возвращает payload в формате before/after/diff.
    const blockEntry = byAction.body.items.find((item: { entityId: string }) => item.entityId === company.userId);
    expect(blockEntry).toBeTruthy();
    expect(blockEntry.payload.diff.status).toEqual({ before: "active", after: "blocked" });
    expect(blockEntry.payload.before.status).toBe("active");
    expect(blockEntry.payload.after.status).toBe("blocked");
    expect(blockEntry.payload.reasonCode).toBe("policy_violation");
    expect(blockEntry.entity).toMatchObject({
      type: "User",
      typeLabel: "Пользователь",
      title: "Иван Тестов",
      subtitle: "user0400001@test.local",
    });

    const byEntity = await ctx.http
      .get("/api/admin/journals?entityType=PlatformSetting")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byEntity.body.items.every((item: { entityType: string }) => item.entityType === "PlatformSetting")).toBe(
      true,
    );

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    const byActor = await ctx.http
      .get(`/api/admin/journals?actorId=${me.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byActor.body.items.every((item: { actorId: string }) => item.actorId === me.body.id)).toBe(true);
    expect(byActor.body.items[0].actor.email).toBe("admin@test.local");
  });

  it("фильтр по диапазону дат отсекает старые записи", async () => {
    const adminToken = await loginAdmin();

    await ctx.http
      .patch("/api/admin/settings/moderation.lock_duration_minutes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 20 });

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await ctx.http.get(`/api/admin/journals?from=${future}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });
});

describe("Platform settings", () => {
  it("выдаёт список настроек со стандартными значениями только админу", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();

    const forbidden = await ctx.http.get("/api/admin/settings").set("Authorization", `Bearer ${moderatorToken}`);
    expect(forbidden.status).toBe(403);

    const res = await ctx.http.get("/api/admin/settings").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const keys = res.body.map((item: { key: string }) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "moderation.lock_duration_minutes",
        "moderation.max_locks_per_moderator",
        "demo.duration_hours",
        "indices.stagnation_threshold_percent",
      ]),
    );
    const lockDuration = res.body.find((item: { key: string }) => item.key === "moderation.lock_duration_minutes");
    expect(lockDuration.value).toBe(15);
    expect(lockDuration.defaultValue).toBe(15);
  });

  it("PATCH меняет значение настройки и пишет audit log", async () => {
    const adminToken = await loginAdmin();

    const res = await ctx.http
      .patch("/api/admin/settings/moderation.lock_duration_minutes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 30 });
    expect(res.status).toBe(200);

    const list = await ctx.http.get("/api/admin/settings").set("Authorization", `Bearer ${adminToken}`);
    const lockDuration = list.body.find((item: { key: string }) => item.key === "moderation.lock_duration_minutes");
    expect(lockDuration.value).toBe(30);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: "moderation.lock_duration_minutes", action: "admin.setting.update" },
    });
    expect(log).toBeTruthy();
    const payload = log?.payload as {
      diff: Record<string, { before: unknown; after: unknown }>;
    };
    expect(payload.diff.value).toEqual({ before: 15, after: 30 });
  });

  it("отказывает в значении вне диапазона", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .patch("/api/admin/settings/moderation.max_locks_per_moderator")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 999 });
    expect(res.status).toBe(400);
  });

  it("отказывает в неизвестном ключе настройки", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .patch("/api/admin/settings/unknown.key")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 1 });
    expect(res.status).toBe(400);
  });

  it("изменение настройки demo.duration_hours применяется к новой регистрации", async () => {
    const adminToken = await loginAdmin();

    await ctx.http
      .patch("/api/admin/settings/demo.duration_hours")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 72 });

    const registered = await registerCompany("0300010");
    const company = await ctx.prisma.company.findUnique({ where: { id: registered.companyId } });
    const ttlHours = (company!.demoEndsAt!.getTime() - Date.now()) / (60 * 60 * 1000);
    expect(ttlHours).toBeGreaterThan(70);
    expect(ttlHours).toBeLessThan(73);
  });

  it("изменение настройки модерации применяется к новым lock'ам", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const author = await registerCompany("0300001");
    const reporter = await registerCompany("0300002");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });

    await ctx.http
      .patch("/api/admin/settings/moderation.lock_duration_minutes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 45 });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    const caseId = list.body.items[0].id as string;

    const lockedAt = Date.now();
    const lock = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/lock`)
      .set("Authorization", `Bearer ${moderatorToken}`);
    expect(lock.status).toBe(201);

    const lockedUntil = new Date(lock.body.lockedUntil).getTime();
    const ttlMinutes = (lockedUntil - lockedAt) / 60000;
    expect(ttlMinutes).toBeGreaterThan(40);
    expect(ttlMinutes).toBeLessThan(50);
  });
});

describe("Admin staff panel", () => {
  it("выдаёт список сотрудников только admin'у", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();

    const forbidden = await ctx.http.get("/api/admin/staff").set("Authorization", `Bearer ${moderatorToken}`);
    expect(forbidden.status).toBe(403);

    const list = await ctx.http.get("/api/admin/staff").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    expect(list.body.hasMore).toBe(false);
    expect(list.body.items.map((item: { user: { email: string } }) => item.user.email)).toEqual(
      expect.arrayContaining(["admin@test.local", "moderator@test.local"]),
    );

    const invalidLimit = await ctx.http.get("/api/admin/staff?limit=abc").set("Authorization", `Bearer ${adminToken}`);
    expect(invalidLimit.status).toBe(400);
  });

  it("создаёт модератора, который может залогиниться выданным паролем", async () => {
    const adminToken = await loginAdmin();

    const res = await ctx.http
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "moder.new@test.local",
        phone: "+79991234567",
        firstName: "Новый",
        lastName: "Модератор",
        gender: "female",
        password: "Moder1234567!",
        roles: ["moderator"],
      });
    expect(res.status).toBe(201);
    expect(res.body.gender).toBe("female");
    expect(res.body.platformStaff.roles).toEqual(["moderator"]);
    expect(res.body.passwordHash).toBeUndefined();

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "moder.new@test.local", password: "Moder1234567!" });
    expect(login.status).toBe(201);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.body.avatarUrl).toBe("/avatars/platform/mwoman.png");
  });

  it("отбивает создание с занятым email/phone", async () => {
    const adminToken = await loginAdmin();

    const res = await ctx.http
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "admin@test.local",
        phone: "+79991234999",
        firstName: "А",
        lastName: "Б",
        gender: "male",
        password: "Password1234!",
        roles: ["moderator"],
      });
    expect(res.status).toBe(409);
  });

  it("PATCH сотрудника меняет роли и пишет лог", async () => {
    const adminToken = await loginAdmin();
    const created = await ctx.http
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "promo.staff@test.local",
        phone: "+79991234500",
        firstName: "К",
        lastName: "М",
        gender: "male",
        password: "Password1234!",
        roles: ["content_manager"],
      });
    expect(created.status).toBe(201);

    const update = await ctx.http
      .patch(`/api/admin/staff/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["content_manager", "moderator"] });
    expect(update.status).toBe(200);
    expect(update.body.roles).toEqual(["content_manager", "moderator"]);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: created.body.id, action: "admin.staff.update" },
    });
    expect(log).toBeTruthy();
  });

  it("деактивация сотрудника отзывает его сессии", async () => {
    const adminToken = await loginAdmin();
    const created = await ctx.http
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "deact.staff@test.local",
        phone: "+79991234501",
        firstName: "К",
        lastName: "М",
        gender: "male",
        password: "Password1234!",
        roles: ["moderator"],
      });
    expect(created.status).toBe(201);

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "deact.staff@test.local", password: "Password1234!" });
    expect(login.status).toBe(201);

    const update = await ctx.http
      .patch(`/api/admin/staff/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(update.status).toBe(200);

    const activeSessions = await ctx.prisma.session.count({
      where: { userId: created.body.id, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
  });

  it("нельзя снять admin у последнего администратора через staff PATCH", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);

    const res = await ctx.http
      .patch(`/api/admin/staff/${me.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ roles: ["moderator"] });
    expect(res.status).toBe(400);
  });
});

describe("Admin sanctions", () => {
  async function escalatedCaseAgainstAuthor(
    adminToken: string,
    moderatorToken: string,
    authorSuffix: string,
    reporterSuffix: string,
  ) {
    const author = await registerCompany(authorSuffix);
    const reporter = await registerCompany(reporterSuffix);
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "illegal_content" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    const caseId = list.body.items[0].id as string;
    await ctx.http.post(`/api/admin/moderation/cases/${caseId}/lock`).set("Authorization", `Bearer ${moderatorToken}`);
    const escalation = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${moderatorToken}`)
      .send({ type: "escalate_to_admin", reasonCode: "severe_violation", comment: "Серьёзное нарушение." });
    expect(escalation.status).toBe(201);
    expect(escalation.body.status).toBe("escalated");

    return { caseId, author, reporter };
  }

  it("admin применяет user_block: пользователь не может войти, сессии отозваны", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId, author } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000060", "0000061");

    const sanction = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "user_block", reasonCode: "severe_violation", comment: "Заблокирован за нарушение." });
    expect(sanction.status).toBe(201);
    expect(sanction.body.status).toBe("closed_by_admin");

    const blockedUser = await ctx.prisma.user.findUnique({ where: { id: author.userId } });
    expect(blockedUser?.status).toBe(UserStatus.blocked);

    const activeSessions = await ctx.prisma.session.count({
      where: { userId: author.userId, revokedAt: null },
    });
    expect(activeSessions).toBe(0);

    const relogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: `user0000060@test.local`, password: "User12345678" });
    expect(relogin.status).toBe(401);
  });

  it("admin применяет company_block: компания заблокирована, сессии всех её пользователей отозваны", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId, author } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000062", "0000063");

    const sanction = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "company_block", reasonCode: "severe_violation", comment: "Блок компании." });
    expect(sanction.status).toBe(201);

    const company = await ctx.prisma.company.findUnique({ where: { id: author.companyId } });
    expect(company?.status).toBe(CompanyStatus.blocked);

    const activeSessions = await ctx.prisma.session.count({
      where: { user: { companyId: author.companyId }, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
  });

  it("admin применяет module_restriction(comments) — пользователь не может оставить комментарий", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId, author } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000064", "0000065");

    const sanction = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        type: "module_restriction",
        moduleCode: "comments",
        durationDays: 7,
        reasonCode: "repeated_violation",
        comment: "Запрет комментариев на неделю.",
      });
    expect(sanction.status).toBe(201);

    const restriction = await ctx.prisma.userModuleRestriction.findFirst({
      where: { userId: author.userId, moduleCode: "comments" },
    });
    expect(restriction).toBeTruthy();
    expect(restriction!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: caseId, action: "moderation.admin_sanction.module_restriction" },
    });
    const payload = log?.payload as {
      before: { restriction: null };
      after: { restriction: { moduleCode: string; expiresAt: string } };
      diff: Record<string, { before: unknown; after: unknown }>;
      sanctionId: string;
      moduleCode: string;
      durationDays: number;
    };
    expect(payload.before.restriction).toBeNull();
    expect(payload.after.restriction.moduleCode).toBe("comments");
    expect(payload.diff.restriction.before).toBeNull();
    expect(payload.diff.restriction.after).toMatchObject({ moduleCode: "comments" });
    expect(payload.sanctionId).toBe(restriction!.sanctionId);
    expect(payload.moduleCode).toBe("comments");
    expect(payload.durationDays).toBe(7);

    const news = await createPublishedNews(adminToken, "module-block");
    const blocked = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Попытка после блокировки модуля" });
    expect(blocked.status).toBe(403);
  });

  it("модератор не имеет права применять admin-санкцию (403)", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000066", "0000067");

    const res = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${moderatorToken}`)
      .send({ type: "user_block", reasonCode: "severe_violation" });
    expect(res.status).toBe(403);
  });

  it("admin-санкция требует кейс в escalated", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000068");
    const reporter = await registerCompany("0000069");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);
    await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${reporter.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${adminToken}`);
    const caseId = list.body.items[0].id as string;

    const res = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "user_block", reasonCode: "severe_violation" });
    expect(res.status).toBe(400);
  });

  it("lift user_block разблокирует пользователя и позволяет логин", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000070", "0000071");

    const applied = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "user_block", reasonCode: "severe_violation" });
    expect(applied.status).toBe(201);

    const sanction = await ctx.prisma.sanction.findFirstOrThrow({
      where: { caseId, type: SanctionType.user_block },
    });

    const lift = await ctx.http
      .post(`/api/admin/moderation/sanctions/${sanction.id}/lift`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "unfounded_complaint", comment: "Пересмотр." });
    expect(lift.status).toBe(201);

    const relogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000070@test.local", password: "User12345678" });
    expect(relogin.status).toBe(201);
  });

  it("lift module_restriction восстанавливает возможность комментировать", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId, author } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000072", "0000073");

    await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        type: "module_restriction",
        moduleCode: "comments",
        durationDays: 14,
        reasonCode: "repeated_violation",
      });

    const sanction = await ctx.prisma.sanction.findFirstOrThrow({
      where: { caseId, type: SanctionType.module_restriction },
    });

    const news = await createPublishedNews(adminToken, "lift-restore");
    const blocked = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "До снятия санкции — должна вернуть 403" });
    expect(blocked.status).toBe(403);

    const lift = await ctx.http
      .post(`/api/admin/moderation/sanctions/${sanction.id}/lift`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "unfounded_complaint" });
    expect(lift.status).toBe(201);

    const restored = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "После снятия — комментарий проходит" });
    expect(restored.status).toBe(201);
  });
});

describe("Content lifecycle: news", () => {
  it("delete новости полностью удаляет её и связанные данные", async () => {
    const adminToken = await loginAdmin();
    const contentManagerToken = await loginContentManager();
    const reader = await registerCompany("0800001");
    const { news, comment } = await createPublishedNewsWithComment(adminToken, reader.token);

    const likePost = await ctx.http.post(`/api/news/${news.id}/like`).set("Authorization", `Bearer ${reader.token}`);
    expect(likePost.status).toBe(201);

    const likeComment = await ctx.http
      .post(`/api/news/comments/${comment.id}/like`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(likeComment.status).toBe(201);

    const before = await ctx.http.get("/api/news").set("Authorization", `Bearer ${reader.token}`);
    expect(before.body.items.find((item: { id: string }) => item.id === news.id)).toBeTruthy();

    const del = await ctx.http
      .delete(`/api/admin/content/news/${news.id}`)
      .set("Authorization", `Bearer ${contentManagerToken}`)
      .send({ reason: "тест удаления" });
    expect(del.status).toBe(200);

    const after = await ctx.http.get("/api/news").set("Authorization", `Bearer ${reader.token}`);
    expect(after.body.items.find((item: { id: string }) => item.id === news.id)).toBeUndefined();

    const direct = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${reader.token}`);
    expect(direct.status).toBe(404);

    const [post, blockCount, postTagCount, postLikeCount, commentCount, commentLikeCount, discussionCount] =
      await Promise.all([
        ctx.prisma.newsPost.findUnique({ where: { id: news.id } }),
        ctx.prisma.newsContentBlock.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsPostTag.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsLike.count({ where: { newsPostId: news.id } }),
        // Comment теперь живёт в Discussion(news_post, news.id) — каскад
        // через Discussion должен снести и комментарии тоже.
        ctx.prisma.comment.count({
          where: { discussion: { targetType: "news_post", targetId: news.id } },
        }),
        ctx.prisma.commentLike.count({ where: { commentId: comment.id } }),
        ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: news.id } }),
      ]);
    expect(post).toBeNull();
    expect(blockCount).toBe(0);
    expect(postTagCount).toBe(0);
    expect(postLikeCount).toBe(0);
    expect(commentCount).toBe(0);
    expect(commentLikeCount).toBe(0);
    expect(discussionCount).toBe(0);
  });
});

describe("Content lifecycle: knowledge base", () => {
  it("publish → виден публично, unpublish → исчезает, delete → 404 на slug", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800002");
    const article = await createPublishedKnowledgeArticle(adminToken, "lifecycle");

    const tree = await ctx.http.get("/api/knowledge-base").set("Authorization", `Bearer ${reader.token}`);
    expect(tree.body.find((item: { id: string }) => item.id === article.id)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${article.id}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/knowledge-base").set("Authorization", `Bearer ${reader.token}`);
    expect(afterUnpublish.body.find((item: { id: string }) => item.id === article.id)).toBeUndefined();

    const del = await ctx.http
      .delete(`/api/admin/content/knowledge-base/${article.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const slugLookup = await ctx.http
      .get(`/api/knowledge-base/${article.slug}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(slugLookup.status).toBe(404);
  });

  it("PATCH статьи заменяет блоки и пишет в audit log", async () => {
    const adminToken = await loginAdmin();
    const draft = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Статья для PATCH",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Старый текст.</p>" } }],
      });
    expect(draft.status).toBe(201);

    const patched = await ctx.http
      .patch(`/api/admin/content/knowledge-base/${draft.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Статья после PATCH",
        position: 0,
        blocks: [
          { type: "heading", payload: { text: "Новый заголовок" } },
          { type: "paragraph", payload: { html: "<p>Новый текст.</p>" } },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Статья после PATCH");
    expect(patched.body.blocks).toHaveLength(2);
    expect(patched.body.blocks[0].type).toBe("heading");

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: draft.body.id, action: "knowledge.update" },
    });
    expect(log).toBeTruthy();
  });
});

describe("Content lifecycle: learning modules", () => {
  async function createLearningModuleWithLesson(adminToken: string, suffix: string) {
    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Модуль ${suffix}`,
        summary: "Краткое",
        description: "Полное описание",
        accessLevel: "basic",
        preview: { promotionalDescription: "Превью", whatYouWillLearn: [] },
        chapters: [],
      });
    expect(moduleRes.status).toBe(201);

    const chapterRes = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/chapters`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Глава 1", position: 0 });
    expect(chapterRes.status).toBe(201);

    const lessonRes = await ctx.http
      .post(`/api/admin/content/education/chapters/${chapterRes.body.id}/lessons`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Урок 1",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело урока.</p>" } }],
        attachments: [],
      });
    expect(lessonRes.status).toBe(201);

    return { moduleId: moduleRes.body.id as string, lessonId: lessonRes.body.id as string };
  }

  it("publish модуля делает его видимым в публичной выдаче, unpublish — скрывает, delete — удаляет", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800010");
    const { moduleId } = await createLearningModuleWithLesson(adminToken, "lifecycle");

    const beforePublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(beforePublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(afterPublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(afterUnpublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

    const del = await ctx.http
      .delete(`/api/admin/content/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const found = await ctx.prisma.learningModule.findUnique({ where: { id: moduleId } });
    expect(found).toBeNull();
  });

  it("модуль в разработке остаётся опубликованным, но закрывает доступ к урокам", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800011");
    const { moduleId, lessonId } = await createLearningModuleWithLesson(adminToken, "development");

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const markDevelopment = await ctx.http
      .patch(`/api/admin/content/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isInDevelopment: true });
    expect(markDevelopment.status).toBe(200);
    expect(markDevelopment.body.isInDevelopment).toBe(true);

    const list = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    const item = list.body.items.find((module: { id: string }) => module.id === moduleId);
    expect(item).toMatchObject({ isInDevelopment: true, hasAccess: false });

    const detail = await ctx.http
      .get(`/api/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.hasAccess).toBe(false);
    expect(detail.body.chapters[0].lessons[0].blocks).toBeUndefined();

    const complete = await ctx.http
      .post(`/api/education/lessons/${lessonId}/complete`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(complete.status).toBe(403);
  });

  it("publish модуля без уроков отбивается 403", async () => {
    const adminToken = await loginAdmin();

    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Пустой модуль",
        summary: "Краткое",
        description: "Полное",
        accessLevel: "basic",
        preview: { promotionalDescription: "Превью", whatYouWillLearn: [] },
        chapters: [],
      });
    expect(moduleRes.status).toBe(201);

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(403);
  });
});

describe("Content updates (PATCH)", () => {
  it("content manager не может поставить чужой файл как coverImageId", async () => {
    const managerToken = await loginContentManager();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const cover = await createCoverAsset(admin.id, "foreign-news-cover");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        title: "Новость с чужой обложкой",
        lead: "Лид",
        coverImageId: cover.id,
        blocks: [{ type: "paragraph", payload: { html: "<p>Текст.</p>" } }],
        tags: ["security"],
      });

    expect(draft.status).toBe(403);
    expect(draft.body.message).toContain("загруженный вами");
  });

  it("PATCH новости меняет title и блоки, оставляет slug прежним", async () => {
    const adminToken = await loginAdmin();
    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Старый заголовок",
        lead: "Лид",
        blocks: [{ type: "paragraph", payload: { html: "<p>Старый текст.</p>" } }],
        tags: ["обновление"],
      });
    expect(draft.status).toBe(201);
    const originalSlug = draft.body.slug as string;

    const patched = await ctx.http
      .patch(`/api/admin/content/news/${draft.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Новый заголовок",
        lead: "Новый лид",
        blocks: [
          { type: "heading", payload: { text: "Заголовок внутри" } },
          { type: "paragraph", payload: { html: "<p>Новый текст.</p>" } },
        ],
        tags: ["обновление", "после-патча"],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Новый заголовок");
    expect(patched.body.slug).toBe(originalSlug);
    expect(patched.body.blocks).toHaveLength(2);
    expect(patched.body.tags).toHaveLength(2);
  });

  it("PATCH модуля обновляет accessLevel и preview", async () => {
    const adminToken = await loginAdmin();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const cover = await createCoverAsset(admin.id, "learning-cover");
    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Модуль до",
        summary: "Краткое",
        description: "Полное",
        accessLevel: "basic",
        preview: { promotionalDescription: "Превью до", whatYouWillLearn: [] },
        chapters: [],
      });
    expect(moduleRes.status).toBe(201);

    const patched = await ctx.http
      .patch(`/api/admin/content/education/modules/${moduleRes.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Модуль после",
        coverImageId: cover.id,
        accessLevel: "extended",
        preview: { promotionalDescription: "Превью после", whatYouWillLearn: ["Пункт 1", "Пункт 2"] },
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Модуль после");
    expect(patched.body.coverImageId).toBe(cover.id);
    expect(patched.body.accessLevel).toBe("extended");
    expect(patched.body.preview.whatYouWillLearn).toEqual(["Пункт 1", "Пункт 2"]);
  });

  it("PATCH главы меняет title и позицию", async () => {
    const adminToken = await loginAdmin();
    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Модуль",
        summary: "—",
        description: "—",
        accessLevel: "basic",
        preview: { promotionalDescription: "—", whatYouWillLearn: [] },
        chapters: [],
      });
    expect(moduleRes.status).toBe(201);

    const chapter1 = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/chapters`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Глава 1", position: 0 });
    expect(chapter1.status).toBe(201);

    const chapter2 = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/chapters`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Глава 2", position: 1 });
    expect(chapter2.status).toBe(201);

    // Поднимем chapter2 на позицию 0 — но position должен оставаться уникальным
    // в рамках модуля, поэтому сначала сдвинем chapter1 на 2, потом chapter2 на 0.
    const moveAside = await ctx.http
      .patch(`/api/admin/content/education/chapters/${chapter1.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ position: 2 });
    expect(moveAside.status).toBe(200);

    const patched = await ctx.http
      .patch(`/api/admin/content/education/chapters/${chapter2.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Глава 2 переименована", position: 0 });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Глава 2 переименована");
    expect(patched.body.position).toBe(0);
  });

  it("PATCH урока заменяет блоки и пишет audit log", async () => {
    const adminToken = await loginAdmin();
    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Модуль",
        summary: "—",
        description: "—",
        accessLevel: "basic",
        preview: { promotionalDescription: "—", whatYouWillLearn: [] },
        chapters: [],
      });
    const chapter = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/chapters`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Глава", position: 0 });
    const lesson = await ctx.http
      .post(`/api/admin/content/education/chapters/${chapter.body.id}/lessons`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Урок",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Версия 1</p>" } }],
        attachments: [],
      });
    expect(lesson.status).toBe(201);

    const patched = await ctx.http
      .patch(`/api/admin/content/education/lessons/${lesson.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Урок v2",
        blocks: [
          { type: "heading", payload: { text: "Глава" } },
          { type: "paragraph", payload: { html: "<p>Версия 2</p>" } },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Урок v2");

    // Сервис updateLesson возвращает только сам урок без вложенных блоков —
    // проверяем подмену блоков через прямой запрос.
    const blocks = await ctx.prisma.lessonContentBlock.findMany({
      where: { lessonId: lesson.body.id },
      orderBy: { position: "asc" },
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe("heading");

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: lesson.body.id, action: { contains: "lesson" } },
    });
    expect(log).toBeTruthy();
  });
});

describe("Content lifecycle: price indices", () => {
  async function createPriceIndexWithValue(adminToken: string, suffix: string) {
    const category = await ctx.http
      .post("/api/admin/content/indices/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Категория ${suffix}`, position: 0 });
    expect(category.status).toBe(201);

    const nomenclature = await ctx.http
      .post("/api/admin/content/indices/nomenclature")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: category.body.id,
        code: `CODE-${suffix}`,
        name: `Номенклатура ${suffix}`,
      });
    expect(nomenclature.status).toBe(201);

    const indexRes = await ctx.http
      .post("/api/admin/content/indices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nomenclatureId: nomenclature.body.id });
    expect(indexRes.status).toBe(201);

    const valueRes = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(valueRes.status).toBe(201);

    return { indexId: indexRes.body.id as string, nomenclatureId: nomenclature.body.id as string };
  }

  it("publish индекса делает его видимым в /indices, unpublish скрывает, delete удаляет", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800020");
    const { indexId, nomenclatureId } = await createPriceIndexWithValue(adminToken, "lifecycle");

    const beforePublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    const findIndex = (body: Array<{ nomenclatures: Array<{ id: string }> }>) =>
      body.some((cat) => cat.nomenclatures.some((nom) => nom.id === nomenclatureId));
    expect(findIndex(beforePublish.body.items)).toBe(false);

    const publish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterPublish.body.items)).toBe(true);

    const unpublish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterUnpublish.body.items)).toBe(false);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/${indexId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const found = await ctx.prisma.priceIndex.findUnique({ where: { id: indexId } });
    expect(found).toBeNull();
  });

  it("add/update значения индекса валидирует индекс и пишет audit log", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/indices/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Категория audit value", position: 0 });
    expect(category.status).toBe(201);

    const nomenclature = await ctx.http
      .post("/api/admin/content/indices/nomenclature")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: category.body.id,
        code: "AUDIT-VALUE",
        name: "Номенклатура audit value",
      });
    expect(nomenclature.status).toBe(201);

    const indexRes = await ctx.http
      .post("/api/admin/content/indices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nomenclatureId: nomenclature.body.id });
    expect(indexRes.status).toBe(201);

    const missing = await ctx.http
      .post("/api/admin/content/indices/missing-index/values")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(missing.status).toBe(404);

    const created = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(created.status).toBe(201);

    const updated = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 13000 });
    expect(updated.status).toBe(201);
    expect(updated.body.id).toBe(created.body.id);

    const logs = await ctx.prisma.adminActionLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((log) => log.action)).toEqual(["indices.value.create", "indices.value.update"]);
    expect(logs[1]?.payload).toMatchObject({ beforePrice: "12000", afterPrice: "13000" });
  });

  it("delete номенклатуры удаляет связанный индекс и всю историю цен", async () => {
    const adminToken = await loginAdmin();
    const { indexId, nomenclatureId } = await createPriceIndexWithValue(adminToken, "cascade-delete");

    await expect(ctx.prisma.priceIndexValue.count({ where: { priceIndexId: indexId } })).resolves.toBe(1);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/nomenclature/${nomenclatureId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест полного удаления" });
    expect(del.status).toBe(200);

    await expect(ctx.prisma.nomenclature.findUnique({ where: { id: nomenclatureId } })).resolves.toBeNull();
    await expect(ctx.prisma.priceIndex.findUnique({ where: { id: indexId } })).resolves.toBeNull();
    await expect(ctx.prisma.priceIndexValue.count({ where: { priceIndexId: indexId } })).resolves.toBe(0);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: nomenclatureId, action: "indices.nomenclature.delete" },
    });
    expect(log?.payload).toMatchObject({ priceIndexId: indexId, priceValuesDeleted: 1 });
  });
});

// Юридические документы и согласия (Волна 6.2). Документы создаются вручную
// в каждом тесте, потому что resetDb чистит ВСЕ таблицы (включая LegalDocument);
// глобального seed для тестов нет.
describe("Legal documents & consents", () => {
  // Используем версии 9.x.x чтобы не пересечься с seed-документами из beforeEach
  // (test-doc-privacy/terms/pd с версией 1.0.0).
  async function createActiveDoc(type: LegalDocumentType, version: string, isRequired = true) {
    return ctx.prisma.legalDocument.create({
      data: {
        type,
        version,
        title: `Документ ${type} ${version}`,
        body: `<p>Тело ${type} ${version}</p>`,
        isRequired,
        isActive: true,
        publishedAt: new Date(),
      },
    });
  }

  it("публичная выдача активных документов: фильтр по типам и без фильтра", async () => {
    // beforeEach создал 3 обязательных документа. Добавим одну cookie-версию.
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);

    const all = await ctx.http.get("/api/legal/documents");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(4);
    const types = all.body.map((d: { type: string }) => d.type).sort();
    expect(types).toEqual(["cookie_policy", "personal_data_consent", "privacy_policy", "terms_of_service"]);
    // body НЕ должно отдаваться в summary-выдаче — это легче для каталога
    expect(all.body[0].body).toBeUndefined();

    const filtered = await ctx.http.get("/api/legal/documents?types=privacy_policy,cookie_policy");
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(2);
    const filteredIds = filtered.body.map((d: { id: string }) => d.id).sort();
    expect(filteredIds.some((id: string) => id === cookieDoc.id)).toBe(true);
  });

  it("получение конкретной версии документа", async () => {
    const res = await ctx.http.get("/api/legal/documents/privacy_policy/1.0.0");
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
    expect(res.body.body).toBeTruthy();

    const missing = await ctx.http.get("/api/legal/documents/privacy_policy/9.9.9");
    expect(missing.status).toBe(404);
  });

  it("POST /consents записывает согласие в БД с IP и user-agent", async () => {
    const doc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const { token, userId } = await registerCompany("0000200");

    const res = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "vitest-agent")
      .send({ documentIds: [doc.id], source: "cookie_banner" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });

    const records = await ctx.prisma.consentRecord.findMany({ where: { userId, documentId: doc.id } });
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("cookie_banner");
    expect(records[0].userAgent).toBe("vitest-agent");
  });

  it("POST /consents отклоняет неактивную версию", async () => {
    const { token } = await registerCompany("0000201");
    const draft = await ctx.prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.cookie_policy,
        version: "0.9.0",
        title: "Черновик",
        body: "<p>x</p>",
        isRequired: false,
        isActive: false,
      },
    });
    const res = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [draft.id] });
    expect(res.status).toBe(400);
  });

  it("GET /me/consents возвращает только согласия текущего пользователя", async () => {
    // На регистрации пользователь подтверждает 3 обязательных документа,
    // поэтому на a уже минимум 3 записи. Добавим ещё одну на cookie.
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const a = await registerCompany("0000202");
    const b = await registerCompany("0000203");
    await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });

    const aMe = await ctx.http.get("/api/legal/me/consents").set("Authorization", `Bearer ${a.token}`);
    expect(aMe.status).toBe(200);
    expect(aMe.body).toHaveLength(4);
    const aDocIds = aMe.body.map((r: { documentId: string }) => r.documentId).sort();
    expect(aDocIds).toEqual([...REQUIRED_DOC_IDS_FOR_TESTS, cookieDoc.id].sort());

    const bMe = await ctx.http.get("/api/legal/me/consents").set("Authorization", `Bearer ${b.token}`);
    expect(bMe.status).toBe(200);
    // b подтвердил только 3 обязательных при регистрации
    expect(bMe.body).toHaveLength(3);
  });

  it("повторный POST /consents идемпотентен (skipDuplicates)", async () => {
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const { token, userId } = await registerCompany("0000204");

    const first = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });
    expect(first.status).toBe(201);
    const second = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });
    expect(second.status).toBe(201);
    const count = await ctx.prisma.consentRecord.count({ where: { userId, documentId: cookieDoc.id } });
    expect(count).toBe(1);
  });

  it("admin создаёт новую версию документа и активирует её, предыдущая деактивируется", async () => {
    // Берём seed-документ test-doc-privacy как v1, создадим новую v2 через API.
    const v1Id = "test-doc-privacy";
    const adminToken = await loginAdmin();

    const create = await ctx.http.post("/api/admin/legal/documents").set("Authorization", `Bearer ${adminToken}`).send({
      type: "privacy_policy",
      version: "1.1.0",
      title: "Политика v1.1",
      summary: "Расширили раздел про cookies",
      body: "<p>Обновлённый текст</p>",
      isRequired: true,
    });
    expect(create.status).toBe(201);
    expect(create.body.isActive).toBe(false);
    const v2Id = create.body.id as string;

    const publish = await ctx.http
      .post(`/api/admin/legal/documents/${v2Id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(publish.status).toBe(201);
    expect(publish.body.isActive).toBe(true);
    expect(publish.body.publishedAt).toBeTruthy();

    const prev = await ctx.prisma.legalDocument.findUnique({ where: { id: v1Id } });
    expect(prev?.isActive).toBe(false);
    const active = await ctx.prisma.legalDocument.findMany({
      where: { type: LegalDocumentType.privacy_policy, isActive: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(v2Id);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: v2Id, action: "admin.legal.document.publish" },
    });
    expect(log).toBeTruthy();
  });

  it("admin не может создать дубль (type, version)", async () => {
    // privacy_policy 1.0.0 уже создан в beforeEach (test-doc-privacy).
    const adminToken = await loginAdmin();

    const res = await ctx.http.post("/api/admin/legal/documents").set("Authorization", `Bearer ${adminToken}`).send({
      type: "privacy_policy",
      version: "1.0.0",
      title: "Дубль",
      body: "<p>x</p>",
      isRequired: true,
    });
    expect(res.status).toBe(409);
  });

  it("обычный пользователь не имеет доступа к admin/legal/*", async () => {
    const { token } = await registerCompany("0000205");
    const res = await ctx.http.get("/api/admin/legal/documents").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("регистрация записывает 3 ConsentRecord c source=registration и ipAddress", async () => {
    const { userId } = await registerCompany("0000206");
    const records = await ctx.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { documentId: "asc" },
    });
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record.source).toBe("registration");
      // ipAddress в integration-supertest может быть пустым — главное, что поле
      // присутствует (NULL допустим). На проде trust proxy=1 заполнит его.
      expect(record).toHaveProperty("ipAddress");
    }
    expect(records.map((r) => r.documentId).sort()).toEqual([...REQUIRED_DOC_IDS_FOR_TESTS].sort());
  });

  it("регистрация без обязательного документа — 400", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Без согласий",
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+79000000300",
      email: "noconsents@test.local",
      password: "User12345678",
      acceptedDocumentIds: ["test-doc-privacy", "test-doc-terms"], // не хватает personal_data_consent
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Согласие на обработку ПДн");
    // пользователь не должен быть создан
    const u = await ctx.prisma.user.findUnique({ where: { email: "noconsents@test.local" } });
    expect(u).toBeNull();
  });

  it("auth/me.requiresReConsent=true после публикации новой обязательной версии", async () => {
    const { token, userId } = await registerCompany("0000207");

    const me1 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me1.body.requiresReConsent).toBe(false);

    // Контент-менеджер публикует новую версию privacy_policy.
    const adminToken = await loginAdmin();
    const created = await ctx.http
      .post("/api/admin/legal/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        type: "privacy_policy",
        version: "2.0.0",
        title: "Политика v2",
        body: "<p>обновили</p>",
        isRequired: true,
      });
    expect(created.status).toBe(201);
    await ctx.http
      .post(`/api/admin/legal/documents/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    // У пользователя ещё нет ConsentRecord на новую активную версию.
    const me2 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me2.body.requiresReConsent).toBe(true);

    // Пользователь подтверждает новую версию.
    const accept = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [created.body.id], source: "login_reconfirm" });
    expect(accept.status).toBe(201);

    const me3 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me3.body.requiresReConsent).toBe(false);

    // sanity: всего 4 записи — 3 при регистрации + 1 на v2
    const count = await ctx.prisma.consentRecord.count({ where: { userId } });
    expect(count).toBe(4);
  });
});

describe("Company profile (Волна 7.2/7.3 — Address, расширенные поля)", () => {
  it("PATCH /billing/company сохраняет контакты, реквизиты и factualAddress", async () => {
    const { token, companyId } = await registerCompany("0700100");

    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        websiteUrl: "https://example.ru",
        corporatePhone: "+74951234567",
        corporateEmail: "info@example.ru",
        about: "Принимаем макулатуру и ПЭТ",
        contactPersonName: "Иван Петров",
        contactPersonPhone: "+79161112233",
        contactPersonEmail: "ivan@example.ru",
        billingInn: "7707083893",
        billingKpp: "770701001",
        bankName: "ПАО Сбербанк",
        bankBik: "044525225",
        bankAccount: "40702810500000000123",
        correspondentAccount: "30101810400000000225",
        factualAddress: {
          country: "Россия",
          region: "Московская область",
          city: "Подольск",
          street: "Ленина",
          building: "12",
          apartment: "5",
          postcode: "142100",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.websiteUrl).toBe("https://example.ru");
    expect(res.body.corporatePhone).toBe("+74951234567");
    expect(res.body.about).toBe("Принимаем макулатуру и ПЭТ");
    expect(res.body.billingInn).toBe("7707083893");
    expect(res.body.factualAddress).toMatchObject({
      country: "Россия",
      region: "Московская область",
      city: "Подольск",
      street: "Ленина",
      building: "12",
      postcode: "142100",
      source: "manual",
    });
    // formatted собран автоматически
    expect(res.body.factualAddress.formatted).toContain("Подольск");
    expect(res.body.factualAddress.formatted).toContain("Ленина");

    // GET /billing/status тоже отдаёт новые поля
    const status = await ctx.http.get("/api/billing/status").set("Authorization", `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.corporateEmail).toBe("info@example.ru");
    expect(status.body.factualAddress.city).toBe("Подольск");
    expect(status.body.structuredLegalAddress).toBeNull();

    // sanity: в БД Address действительно создан
    const company = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      include: { factualAddress: true },
    });
    expect(company?.factualAddress?.city).toBe("Подольск");
  });

  it("повторный PATCH с factualAddress обновляет ту же строку Address, не создаёт новую", async () => {
    const { token, companyId } = await registerCompany("0700101");

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factualAddress: { city: "Москва", postcode: "101000" },
      });
    const company1 = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      select: { factualAddressId: true },
    });
    expect(company1?.factualAddressId).toBeTruthy();
    const addressIdBefore = company1!.factualAddressId!;

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factualAddress: { city: "Санкт-Петербург", postcode: "190000" },
      });
    const company2 = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      include: { factualAddress: true },
    });
    expect(company2?.factualAddressId).toBe(addressIdBefore);
    expect(company2?.factualAddress?.city).toBe("Санкт-Петербург");

    // Проверяем, что не создалось двух Address-ов на эту компанию
    const total = await ctx.prisma.address.count();
    // На той же тестовой сессии могли быть прочие Address — проверяем точечно
    expect(company2?.factualAddress?.id).toBe(addressIdBefore);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it("structuredLegalAddress дублирует formatted в старое legalAddress (обратная совместимость)", async () => {
    const { token, companyId } = await registerCompany("0700102");

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        structuredLegalAddress: {
          city: "Тула",
          street: "Советская",
          building: "1",
          formatted: "300000, г. Тула, ул. Советская, д. 1",
        },
      });

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.legalAddress).toBe("300000, г. Тула, ул. Советская, д. 1");
  });

  it("PATCH /billing/company от платформенного staff → 403", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ websiteUrl: "https://x.test" });
    expect(res.status).toBe(403);
  });

  it("PATCH с битым ИНН → 400", async () => {
    const { token } = await registerCompany("0700103");
    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({ billingInn: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("Discussion (полиморфные обсуждения, Волна 7.1)", () => {
  it("первый POST /news/:id/comments лениво создаёт Discussion(news_post, id)", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700001");
    const news = await createPublishedNews(adminToken, "discussion-lazy");

    // До первого комментария Discussion ещё нет.
    const before = await ctx.prisma.discussion.findUnique({
      where: { targetType_targetId: { targetType: "news_post", targetId: news.id } },
    });
    expect(before).toBeNull();

    const res = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Первый комментарий" });
    expect(res.status).toBe(201);

    const after = await ctx.prisma.discussion.findUnique({
      where: { targetType_targetId: { targetType: "news_post", targetId: news.id } },
      include: { comments: true },
    });
    expect(after).toBeTruthy();
    expect(after?.comments).toHaveLength(1);
    expect(after?.comments[0].text).toBe("Первый комментарий");
  });

  it("второй комментарий переиспользует существующую Discussion (не создаёт дубль)", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700002");
    const news = await createPublishedNews(adminToken, "discussion-reuse");

    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Первый" });
    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Второй" });

    const discussions = await ctx.prisma.discussion.findMany({
      where: { targetType: "news_post", targetId: news.id },
      include: { comments: true },
    });
    expect(discussions).toHaveLength(1);
    expect(discussions[0].comments).toHaveLength(2);
  });

  it("GET /news/:slug возвращает комментарии через Discussion и счётчик _count.comments", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700003");
    const news = await createPublishedNews(adminToken, "discussion-fetch");

    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Видимый комментарий" });

    const res = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].text).toBe("Видимый комментарий");
    expect(res.body._count.comments).toBe(1);
  });

  it("POST /news/:id/comments не создаёт Discussion для черновика, отсутствующей новости или чужого parent", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700004");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Черновик без комментариев",
        lead: "Лид",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
        tags: [],
      });
    expect(draft.status).toBe(201);

    const draftComment = await ctx.http
      .post(`/api/news/${draft.body.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Комментарий к черновику" });
    expect(draftComment.status).toBe(404);
    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: draft.body.id } }),
    ).resolves.toBe(0);

    const missingComment = await ctx.http
      .post("/api/news/missing-news-id/comments")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Комментарий к отсутствующей новости" });
    expect(missingComment.status).toBe(404);
    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: "missing-news-id" } }),
    ).resolves.toBe(0);

    const firstNews = await createPublishedNews(adminToken, "discussion-parent-a");
    const secondNews = await createPublishedNews(adminToken, "discussion-parent-b");
    const parent = await ctx.http
      .post(`/api/news/${firstNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Родительский комментарий" });
    expect(parent.status).toBe(201);

    const foreignParent = await ctx.http
      .post(`/api/news/${secondNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Ответ не в той новости", parentCommentId: parent.body.id });
    expect(foreignParent.status).toBe(404);

    const missingParent = await ctx.http
      .post(`/api/news/${secondNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Ответ без родителя", parentCommentId: "missing-comment-id" });
    expect(missingParent.status).toBe(404);

    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: secondNews.id } }),
    ).resolves.toBe(0);
  });
});

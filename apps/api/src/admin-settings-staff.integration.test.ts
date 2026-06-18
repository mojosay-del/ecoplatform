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
        "marketplace.enabled",
        "indices.stagnation_threshold_percent",
      ]),
    );
    const lockDuration = res.body.find((item: { key: string }) => item.key === "moderation.lock_duration_minutes");
    expect(lockDuration.value).toBe(15);
    expect(lockDuration.defaultValue).toBe(15);
    const marketplace = res.body.find((item: { key: string }) => item.key === "marketplace.enabled");
    expect(marketplace.value).toBe(false);
    expect(marketplace.defaultValue).toBe(false);
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

  it("изменение настройки demo.duration_hours применяется к новому пробному доступу", async () => {
    const adminToken = await loginAdmin();

    await ctx.http
      .patch("/api/admin/settings/demo.duration_hours")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ value: 72 });

    const registered = await registerCompany("0300010", { activateTrial: false });
    const trial = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${registered.token}`)
      .set("Idempotency-Key", `settings-trial-${registered.companyId}`);
    expect(trial.status).toBe(201);

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
    expect(me.body.avatarUrl).toBeNull();
  });

  it("создаёт сотрудника без пола и отдаёт gender=null", async () => {
    const adminToken = await loginAdmin();

    const res = await ctx.http
      .post("/api/admin/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "staff.no-gender@test.local",
        phone: "+79991234568",
        firstName: "Нейтральный",
        lastName: "Сотрудник",
        password: "Staff1234567!",
        roles: ["moderator"],
      });
    expect(res.status).toBe(201);
    expect(res.body.gender).toBeNull();

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "staff.no-gender@test.local", password: "Staff1234567!" });
    expect(login.status).toBe(201);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.gender).toBeNull();
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

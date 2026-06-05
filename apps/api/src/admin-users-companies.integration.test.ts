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
  it("notifications API валидирует query и не отдаёт внутренний payload", async () => {
    const company = await registerCompany("0699901");
    const note = await ctx.prisma.inAppNotification.create({
      data: {
        userId: company.userId,
        domainEventId: "audit.notification.payload:1",
        eventType: "audit.notification.payload",
        category: "moderation",
        title: "Проверка уведомления",
        body: "Внутренние детали не должны попадать в публичный ответ.",
        link: "/account",
        payload: { ipAddress: "127.0.0.1", userAgent: "test-agent", internalId: "secret-case-id" },
      },
    });

    const invalid = await ctx.http.get("/api/notifications?limit=abc").set("Authorization", `Bearer ${company.token}`);
    expect(invalid.status).toBe(400);

    const list = await ctx.http.get("/api/notifications?limit=5").set("Authorization", `Bearer ${company.token}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: note.id,
      eventType: "audit.notification.payload",
      title: "Проверка уведомления",
    });
    expect(list.body.items[0]).not.toHaveProperty("payload");
    expect(list.body.items[0]).not.toHaveProperty("domainEventId");
    expect(list.body.items[0]).not.toHaveProperty("sourceId");
    expect(list.body.items[0]).not.toHaveProperty("deliveryId");
    expect(list.body.items[0]).not.toHaveProperty("userId");

    const read = await ctx.http
      .post(`/api/notifications/${note.id}/read`)
      .set("Authorization", `Bearer ${company.token}`);
    expect(read.status).toBe(201);
    expect(read.body.readAt).toBeTruthy();
    expect(read.body).not.toHaveProperty("payload");

    const archive = await ctx.http
      .post(`/api/notifications/${note.id}/archive`)
      .set("Authorization", `Bearer ${company.token}`);
    expect(archive.status).toBe(201);
    expect(archive.body.archivedAt).toBeTruthy();
    expect(archive.body).not.toHaveProperty("payload");
  });

  it("preferences API сохраняет только управляемые категории", async () => {
    const company = await registerCompany("0699902");

    const saved = await ctx.http
      .patch("/api/notifications/preferences")
      .set("Authorization", `Bearer ${company.token}`)
      .send({
        inAppMutedCategories: ["moderation", "security", "marketplace", "system"],
        emailMutedCategories: ["support", "billing", "security", "system"],
      });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      inAppMutedCategories: ["moderation"],
      emailMutedCategories: ["support", "billing"],
    });
    expect(saved.body).not.toHaveProperty("id");
    expect(saved.body).not.toHaveProperty("userId");

    const loaded = await ctx.http.get("/api/notifications/preferences").set("Authorization", `Bearer ${company.token}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual(saved.body);
  });

  it("при логине security-доставка не создаётся", async () => {
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
    expect(deliveries).toHaveLength(0);
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

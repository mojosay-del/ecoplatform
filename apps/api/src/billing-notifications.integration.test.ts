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
  it("не создаёт уведомление о входе после успешного логина", async () => {
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
    expect(note).toBeNull();
  });

  it("не создаёт уведомление о входе с нового устройства", async () => {
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
    expect(note).toBeNull();
  });

  it("смена пароля: отзывает другие сессии без security-уведомления, новый пароль работает", async () => {
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
    expect(note).toBeNull();
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

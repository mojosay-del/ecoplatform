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
  createCompanyMember,
  createPublishedNewsWithComment,
  createPublishedNews,
  createCoverAsset,
  createPublishedKnowledgeArticle,
} = ctx;

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

  it("очищает refresh-cookie, если refresh-токен недействителен", async () => {
    const csrf = await ctx.rawHttp.get("/api/auth/csrf");
    const csrfCookie = responseCookiePart(csrf, "csrf-token");
    expect(csrfCookie).toBeDefined();

    const csrfToken = csrfCookie!.slice("csrf-token=".length);
    const invalidRefresh = await ctx.rawHttp
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=missing-session.invalid-tail", csrfCookie!])
      .set("X-CSRF-Token", csrfToken);

    expect(invalidRefresh.status).toBe(401);
    const clearedRefreshCookie = responseCookieFull(invalidRefresh, "refreshToken");
    expect(clearedRefreshCookie).toContain("refreshToken=");
    expect(clearedRefreshCookie).toContain("Path=/api/auth");
    expect(clearedRefreshCookie).toContain("Expires=Thu, 01 Jan 1970");
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

  it("регистрация после подтверждения почты создаёт компанию в demo-статусе и возвращает access-токен", async () => {
    const { token, companyId } = await registerCompany("0000001");
    expect(token).toMatch(/\./);

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe(CompanyStatus.demo);
    expect(company?.type).toBe("collector");
    expect(company?.demoEndsAt).toBeInstanceOf(Date);
    expect(company!.demoEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("регистрация не создаёт пользователя до ввода кода из письма", async () => {
    const start = await submitRegistration({
      organizationName: "ООО Код Потом",
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+79000001000",
      email: "pending-code@test.local",
      password: "User12345678",
    });

    const pendingUser = await ctx.prisma.user.findUnique({ where: { email: "pending-code@test.local" } });
    expect(pendingUser).toBeNull();

    const wrongCode = await ctx.http
      .post("/api/auth/register/verify")
      .send({ verificationId: start.verificationId, code: "0000" });
    expect(wrongCode.status).toBe(400);

    const token = await verifyRegistration(start.verificationId);
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("pending-code@test.local");
  });

  it("без загруженного фото аватар профиля пустой (нейтральная иконка на фронте)", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.gender).toBeNull();
    expect(me.body.avatarUrl).toBeNull();
    expect(me.body.company).toBeNull();
    expect(me.body.companyId).toBeNull();
    expect(me.body.requiresReConsent).toBe(false);
  });

  it("регистрация сохраняет тип компании и пол", async () => {
    const token = await registerWithBody({
      organizationName: "ООО Трейд Жен",
      companyType: "trader",
      firstName: "Анна",
      lastName: "Тестова",
      gender: "female",
      phone: "+375291234567",
      email: "trader-female@test.local",
      password: "User12345678",
    });

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.gender).toBe("female");
    expect(me.body.company.type).toBe("trader");
    expect(me.body.company.organizationName).toBe("ООО Трейд Жен");
    expect(me.body.avatarUrl).toBeNull();
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: me.body.company.id } });
    expect(company.billingInn).toBeNull();
  });

  it("регистрация без пола оставляет gender пустым, а профиль позволяет заполнить и очистить его", async () => {
    const token = await registerWithBody({
      organizationName: "ООО Без Пола",
      companyType: "collector",
      firstName: "Ольга",
      lastName: "Добровольная",
      phone: "+79000001001",
      email: "without-gender@test.local",
      password: "User12345678",
    });

    const initialMe = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(initialMe.status).toBe(200);
    expect(initialMe.body.gender).toBeNull();

    const setGender = await ctx.http
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: "female" });
    expect(setGender.status).toBe(200);
    expect(setGender.body.gender).toBe("female");

    const clearGender = await ctx.http
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: null });
    expect(clearGender.status).toBe(200);
    expect(clearGender.body.gender).toBeNull();
  });

  it("повторная регистрация с тем же email отбивается 409", async () => {
    await registerCompany("0000002");
    const dup = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Дубль",
      companyType: "collector",
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

  it("регистрация не принимает ИНН: реквизиты заполняются в профиле компании", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО ИНН Потом",
      companyType: "collector",
      billingInn: "7707083893",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+71111111113",
      email: "bad-inn@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("ИНН заполняется в профиле компании");
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
    expect(note).toBeNull();
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
    expect(note).toBeNull();

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

  it("участник (member) удаляет свой аккаунт, не роняя компанию в pending_deletion", async () => {
    const { companyId, userId: ownerId } = await registerCompany("0000008");

    const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
    expect(owner.companyRole).toBe(CompanyRole.owner);

    // Флоу приёма приглашений ещё не реализован — сотрудника-участника
    // создаём напрямую и привязываем к той же компании с ролью member.
    const member = await ctx.prisma.user.create({
      data: {
        email: "member0000008@test.local",
        firstName: "Пётр",
        lastName: "Сотрудников",
        phone: "+79010000008",
        passwordHash: await hash("Member12345678", 4),
        companyId,
        companyRole: CompanyRole.member,
      },
    });

    const memberLogin = await ctx.http
      .post("/api/auth/login")
      .send({ email: "member0000008@test.local", password: "Member12345678" });
    expect(memberLogin.status).toBe(201);

    const requestDeletion = await ctx.http
      .post("/api/auth/me/request-deletion")
      .set("Authorization", `Bearer ${memberLogin.body.accessToken}`);
    expect(requestDeletion.status).toBe(201);

    // Помечен на удаление только аккаунт участника; компания остаётся в demo.
    const memberAfter = await ctx.prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    const companyAfter = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(memberAfter.deletionRequestedAt).toBeInstanceOf(Date);
    expect(companyAfter.status).toBe(CompanyStatus.demo);
    expect(companyAfter.statusBeforeDeletion).toBeNull();

    // По истечении грейс-периода крон вычищает только участника — компания и
    // её владелец продолжают работать.
    await ctx.prisma.user.update({
      where: { id: member.id },
      data: { deletionRequestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    const scheduler = ctx.app.get(SchedulerService);
    await scheduler.cleanupDeletedAccounts(new Date());

    await expect(ctx.prisma.user.findUnique({ where: { id: member.id } })).resolves.toBeNull();
    await expect(ctx.prisma.user.findUnique({ where: { id: ownerId } })).resolves.not.toBeNull();
    const companyAfterCleanup = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(companyAfterCleanup.status).toBe(CompanyStatus.demo);
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

  it("самостоятельная активация Базовой подписки возвращает доступ на месяц", async () => {
    const { token, companyId, userId } = await registerCompany("0000016");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const closed = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(closed.status).toBe(403);

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-basic-${companyId}`)
      .send({ plan: "basic" });

    expect(res.status).toBe(201);
    expect(res.body.company.status).toBe("active");
    expect(res.body.company.subscriptionPlan).toBe("basic");
    expect(new Date(res.body.subscription.endsAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    const open = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(open.status).toBe(200);

    const [logs, notifications] = await Promise.all([
      ctx.prisma.adminActionLog.findMany({
        where: { action: "self_subscription_activation", entityId: companyId },
      }),
      ctx.prisma.inAppNotification.findMany({
        where: { userId, eventType: "billing.subscription.activated" },
      }),
    ]);
    expect(logs).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    const payload = logs[0].payload as {
      before: { status: string };
      after: { status: string; subscriptionPlan: string };
      durationDays: number;
      source: string;
    };
    expect(payload.before.status).toBe("demo");
    expect(payload.after.status).toBe("active");
    expect(payload.after.subscriptionPlan).toBe("basic");
    expect(payload.durationDays).toBe(30);
    expect(payload.source).toBe("subscription_page");
  });

  it("участник компании не может самостоятельно активировать подписку", async () => {
    const { companyId } = await registerCompany("0000020");
    const member = await createCompanyMember(companyId, "0000020");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", `self-member-reject-${companyId}`)
      .send({ plan: "basic" });

    expect(res.status).toBe(403);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(0);
    await expect(
      ctx.prisma.adminActionLog.count({ where: { action: "self_subscription_activation", entityId: companyId } }),
    ).resolves.toBe(0);
  });

  it("самостоятельная активация Расширенной подписки работает после истечения платной подписки", async () => {
    const adminToken = await loginAdmin();
    const { token, companyId } = await registerCompany("0000017");
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-before-self-${companyId}`)
      .send({
        companyId,
        plan: "basic",
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        reason: "initial-paid-test",
      });
    const pastEndsAt = new Date(Date.now() - 60 * 60 * 1000);
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.past_due, subscriptionEndsAt: pastEndsAt },
    });
    await ctx.prisma.subscription.updateMany({
      where: { companyId },
      data: { status: SubscriptionStatus.expired, endsAt: pastEndsAt },
    });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-extended-${companyId}`)
      .send({ plan: "extended" });

    expect(res.status).toBe(201);
    expect(res.body.company.status).toBe("active");
    expect(res.body.company.subscriptionPlan).toBe("extended");
  });

  it("самостоятельная активация идемпотентна и не создаёт дубль подписки", async () => {
    const { token, companyId } = await registerCompany("0000018");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    const key = `self-idempotency-${companyId}`;

    const first = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "basic" });
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "basic" });
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const conflict = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "extended" });
    expect(conflict.status).toBe(409);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(1);
  });

  it("самостоятельная активация не продлевает уже активную подписку бесплатно", async () => {
    const adminToken = await loginAdmin();
    const { token, companyId } = await registerCompany("0000019");
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-active-before-self-${companyId}`)
      .send({
        companyId,
        plan: "basic",
        endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        reason: "active-subscription-test",
      });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-active-reject-${companyId}`)
      .send({ plan: "extended" });

    expect(res.status).toBe(409);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(1);
  });

  it("платформенный сотрудник не может активировать клиентскую подписку для себя", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", "self-platform-staff")
      .send({ plan: "basic" });

    expect(res.status).toBe(403);
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

import { CompanyRole, CompanyStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { SchedulerService } from "./scheduler/scheduler.service";
import { setupIntegrationContext } from "./test/integration-context";
import { parseBinary, responseCookieFull, responseCookiePart } from "./test/integration-helpers";

const ctx = setupIntegrationContext();
const { registerCompany } = ctx;

describe("Auth — сессии и удаление аккаунта", () => {
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

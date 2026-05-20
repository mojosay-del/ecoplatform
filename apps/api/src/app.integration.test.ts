// Integration-тест сквозного MVP-сценария.
// Поднимает реальное Nest-приложение, ходит через HTTP (supertest), пишет в реальную PostgreSQL (ecoplatform_test).
// Все тесты используют один и тот же app, между тестами TRUNCATE всех таблиц.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { CompanyStatus, ContentStatus, PlatformRole } from "@prisma/client";
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
  await ctx.prisma.user.create({
    data: {
      email: "admin@test.local",
      firstName: "Админ",
      lastName: "Тестов",
      phone: "+70000000001",
      passwordHash: await hash("Admin12345", 4),
      platformStaff: { create: { roles: [PlatformRole.admin], isActive: true } },
    },
  });
});

async function loginAdmin(): Promise<string> {
  const res = await ctx.http
    .post("/api/auth/login")
    .send({ email: "admin@test.local", password: "Admin12345" });
  expect(res.status).toBe(201);
  return res.body.accessToken as string;
}

async function registerCompany(suffix: string): Promise<{ token: string; companyId: string; userId: string }> {
  const res = await ctx.http.post("/api/auth/register").send({
    organizationName: `ООО Тест ${suffix}`,
    firstName: "Иван",
    lastName: "Тестов",
    phone: `+7900${suffix}`,
    email: `user${suffix}@test.local`,
    password: "User12345",
  });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;

  const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  expect(me.status).toBe(200);
  return { token, companyId: me.body.company.id, userId: me.body.id };
}

describe("Auth", () => {
  it("регистрация создаёт компанию в demo-статусе и возвращает access-токен", async () => {
    const { token, companyId } = await registerCompany("0000001");
    expect(token).toMatch(/\./);

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe(CompanyStatus.demo);
    expect(company?.demoEndsAt).toBeInstanceOf(Date);
    expect(company!.demoEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("повторная регистрация с тем же email отбивается 409", async () => {
    await registerCompany("0000002");
    const dup = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Дубль",
      firstName: "А",
      lastName: "Б",
      phone: "+71111111111",
      email: "user0000002@test.local",
      password: "User12345",
    });
    expect(dup.status).toBe(409);
  });

  it("login с неверным паролем возвращает 401", async () => {
    await registerCompany("0000003");
    const res = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0000003@test.local", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("/auth/me без токена отвечает 401", async () => {
    const res = await ctx.http.get("/api/auth/me");
    expect(res.status).toBe(401);
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
      .send({ companyId, plan: "basic", endsAt, reason: "integration-test" });
    expect(act.status).toBe(201);
    expect(act.body.company.status).toBe("active");
    expect(act.body.company.subscriptionPlan).toBe("basic");

    // 3. Доступ восстановлен
    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(200);
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
        blocks: [{ type: "paragraph", payload: { markdown: "Тело новости." } }],
        tags: ["test"],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe(ContentStatus.draft);
    const slug = draft.body.slug as string;
    expect(slug).toBeTruthy();

    // До публикации — публичный список не содержит её
    const before = await ctx.http.get("/api/news").set("Authorization", `Bearer ${userToken}`);
    expect(before.body.find((n: { slug: string }) => n.slug === slug)).toBeUndefined();

    const publish = await ctx.http
      .post(`/api/admin/content/news/${draft.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe(ContentStatus.published);

    const after = await ctx.http.get("/api/news").set("Authorization", `Bearer ${userToken}`);
    expect(after.body.find((n: { slug: string }) => n.slug === slug)).toBeTruthy();
  });

  it("новость с некорректным блоком (paragraph без markdown) отбивается 400", async () => {
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
    expect(listA.body.some((x: { id: string }) => x.id === ticketId)).toBe(true);

    // B не видит
    const listB = await ctx.http.get("/api/support/tickets").set("Authorization", `Bearer ${b.token}`);
    expect(listB.body.some((x: { id: string }) => x.id === ticketId)).toBe(false);

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
    expect(adminReply.body.messages.some((m: { authorRole: string; text: string }) => m.authorRole === "admin" && m.text === "Ответ админа")).toBe(true);
  });
});

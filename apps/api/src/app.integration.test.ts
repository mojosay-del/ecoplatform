// Integration-тест сквозного MVP-сценария.
// Поднимает реальное Nest-приложение, ходит через HTTP (supertest), пишет в реальную PostgreSQL (ecoplatform_test).
// Все тесты используют один и тот же app, между тестами TRUNCATE всех таблиц.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { CommentStatus, CompanyStatus, ContentStatus, PlatformRole, SanctionType } from "@prisma/client";
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

async function createPublishedNewsWithComment(adminToken: string, authorToken: string) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: "Новость для модерации",
      lead: "Лид новости",
      blocks: [{ type: "paragraph", payload: { markdown: "Тело новости." } }],
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

    expect(await ctx.prisma.moderationCase.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(1);
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

    const forbidden = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${reporter.token}`);
    expect(forbidden.status).toBe(403);

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const caseId = list.body[0].id as string;

    const lock = await ctx.http.post(`/api/admin/moderation/cases/${caseId}/lock`).set("Authorization", `Bearer ${moderatorToken}`);
    expect(lock.status).toBe(201);
    expect(lock.body.status).toBe("in_review");
    expect(lock.body.lockedBy.email).toBe("moderator@test.local");

    const release = await ctx.http.post(`/api/admin/moderation/cases/${caseId}/release`).set("Authorization", `Bearer ${moderatorToken}`);
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
    const caseId = list.body[0].id as string;
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
    const caseId = list.body[0].id as string;
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
    const caseId = list.body[0].id as string;
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
});

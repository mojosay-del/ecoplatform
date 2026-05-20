// Integration-тест сквозного MVP-сценария.
// Поднимает реальное Nest-приложение, ходит через HTTP (supertest), пишет в реальную PostgreSQL (ecoplatform_test).
// Все тесты используют один и тот же app, между тестами TRUNCATE всех таблиц.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { CommentStatus, CompanyStatus, ContentStatus, PlatformRole, SanctionType, UserStatus } from "@prisma/client";
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

async function createPublishedNews(adminToken: string, suffix: string) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Новость для модерации ${suffix}`,
      lead: "Лид новости",
      blocks: [{ type: "paragraph", payload: { markdown: "Тело новости." } }],
      tags: [`moderation-${suffix}`],
    });
  expect(draft.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/news/${draft.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  return publish.body as { id: string; slug: string; title: string };
}

async function createPublishedKnowledgeArticle(adminToken: string, suffix: string) {
  const draft = await ctx.http
    .post("/api/admin/content/knowledge-base")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Статья ${suffix}`,
      position: 0,
      blocks: [{ type: "paragraph", payload: { markdown: "Тело статьи." } }],
    });
  expect(draft.status).toBe(201);

  const publish = await ctx.http
    .post(`/api/admin/content/knowledge-base/${draft.body.id}/publish`)
    .set("Authorization", `Bearer ${adminToken}`);
  expect(publish.status).toBe(201);

  return publish.body as { id: string; slug: string; title: string };
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
    expect(list.body).toHaveLength(1);
    expect(list.body[0].entity).toMatchObject({ type: "news_post", title: news.title, slug: news.slug });
    const caseId = list.body[0].id as string;

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
    expect(publicNewsFeed.body.some((item: { id: string }) => item.id === news.id)).toBe(false);

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
    expect(list.body).toHaveLength(1);
    expect(list.body[0].entity).toMatchObject({ type: "knowledge_article", title: article.title, slug: article.slug });
    const caseId = list.body[0].id as string;

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
    const caseId = list.body[0].id as string;
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

    const card = await ctx.http
      .get(`/api/admin/users/${target.userId}`)
      .set("Authorization", `Bearer ${adminToken}`);
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
      .send({ email: "user0100004@test.local", password: "User12345" });
    expect(relogin.status).toBe(401);

    const unblock = await ctx.http
      .post(`/api/admin/users/${target.userId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ comment: "Пересмотр." });
    expect(unblock.status).toBe(201);
    expect(unblock.body.status).toBe(UserStatus.active);

    const reloginOk = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0100004@test.local", password: "User12345" });
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

    const all = await ctx.http
      .get("/api/admin/journals?take=100")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThanOrEqual(2);

    const byAction = await ctx.http
      .get("/api/admin/journals?action=admin.user.block")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byAction.body.items.every((item: { action: string }) => item.action === "admin.user.block")).toBe(true);

    const byEntity = await ctx.http
      .get("/api/admin/journals?entityType=PlatformSetting")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byEntity.body.items.every((item: { entityType: string }) => item.entityType === "PlatformSetting")).toBe(true);

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
    const res = await ctx.http
      .get(`/api/admin/journals?from=${future}`)
      .set("Authorization", `Bearer ${adminToken}`);
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
    const caseId = list.body[0].id as string;

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
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.map((item: { user: { email: string } }) => item.user.email)).toEqual(
      expect.arrayContaining(["admin@test.local", "moderator@test.local"]),
    );
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
        password: "Moder12345!",
        roles: ["moderator"],
      });
    expect(res.status).toBe(201);
    expect(res.body.platformStaff.roles).toEqual(["moderator"]);

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "moder.new@test.local", password: "Moder12345!" });
    expect(login.status).toBe(201);
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
        password: "Password1!",
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
        password: "Password1!",
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
        password: "Password1!",
        roles: ["moderator"],
      });
    expect(created.status).toBe(201);

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "deact.staff@test.local", password: "Password1!" });
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
    const caseId = list.body[0].id as string;
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
      .send({ email: `user0000060@test.local`, password: "User12345" });
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
    const caseId = list.body[0].id as string;

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
      .send({ email: "user0000070@test.local", password: "User12345" });
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

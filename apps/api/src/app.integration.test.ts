// Integration-тест сквозного MVP-сценария.
// Поднимает реальное Nest-приложение, ходит через HTTP (supertest), пишет в реальную PostgreSQL (ecoplatform_test).
// Все тесты используют один и тот же app, между тестами TRUNCATE всех таблиц.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { CommentStatus, CompanyStatus, ContentStatus, PlatformRole, SanctionType, SubscriptionStatus, UserStatus } from "@prisma/client";
import { BillingNotificationsService } from "./billing/billing-notifications.service";
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
    companyType: "collector",
    firstName: "Иван",
    lastName: "Тестов",
    gender: "male",
    phone: `+7900${suffix}`,
    email: `user${suffix}@test.local`,
    password: "User123456",
  });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;

  const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  expect(me.status).toBe(200);
  expect(me.body.avatarUrl).toBe("/avatars/company/zman.png");
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

async function createPublishedNews(adminToken: string, suffix: string) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      title: `Новость для модерации ${suffix}`,
      lead: "Лид новости",
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
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
      blocks: [{ type: "paragraph", payload: { html: "<p>Тело статьи.</p>" } }],
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
  });

  it("регистрация сохраняет тип компании и пол для аватара профиля", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Трейд Жен",
      companyType: "trader",
      firstName: "Анна",
      lastName: "Тестова",
      gender: "female",
      phone: "+71111111112",
      email: "trader-female@test.local",
      password: "User123456",
    });
    expect(res.status).toBe(201);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.gender).toBe("female");
    expect(me.body.company.type).toBe("trader");
    expect(me.body.avatarUrl).toBe("/avatars/company/twoman.png");
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
      password: "User123456",
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

    const res = await ctx.http
      .get("/api/admin/content/news/tags")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map((tag: { name: string }) => tag.name)).toEqual(
      expect.arrayContaining(["рынок", "переработка", "экология"]),
    );
    expect(res.body.find((tag: { name: string }) => tag.name === "рынок").usageCount).toBe(2);
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
      .send({ email: "user0100004@test.local", password: "User123456" });
    expect(relogin.status).toBe(401);

    const unblock = await ctx.http
      .post(`/api/admin/users/${target.userId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ comment: "Пересмотр." });
    expect(unblock.status).toBe(201);
    expect(unblock.body.status).toBe(UserStatus.active);

    const reloginOk = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0100004@test.local", password: "User123456" });
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

describe("Email channel queue (задел)", () => {
  it("при логине создаётся не только in_app, но и email-доставка в статусе queued", async () => {
    const company = await registerCompany("0700001");
    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0700001@test.local", password: "User123456" });
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
    const caseId = list.body[0].id as string;
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
      .send({ email: "user0500001@test.local", password: "User123456" });
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
      .send({ email: "user0500002@test.local", password: "User123456" });
    expect(login.status).toBe(201);

    const note = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: company.userId, eventType: "auth.login.new_device" },
      orderBy: { createdAt: "desc" },
    });
    expect(note).toBeTruthy();
    expect(note?.title).toContain("нового устройства");
  });

  it("смена пароля: отзывает другие сессии, создаёт уведомление, новый пароль работает", async () => {
    const company = await registerCompany("0500003");

    // Открываем вторую сессию параллельно.
    const second = await ctx.http
      .post("/api/auth/login")
      .send({ email: "user0500003@test.local", password: "User123456" });
    expect(second.status).toBe(201);
    const secondToken = second.body.accessToken as string;

    // Со второй сессии меняем пароль.
    const change = await ctx.http
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ currentPassword: "User123456", newPassword: "NewPassw0rd!" });
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
      .send({ email: "user0500003@test.local", password: "User123456" });
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
      .send({ currentPassword: "User123456", newPassword: "short" });
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
        gender: "female",
        password: "Moder12345!",
        roles: ["moderator"],
      });
    expect(res.status).toBe(201);
    expect(res.body.gender).toBe("female");
    expect(res.body.platformStaff.roles).toEqual(["moderator"]);

    const login = await ctx.http
      .post("/api/auth/login")
      .send({ email: "moder.new@test.local", password: "Moder12345!" });
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
        gender: "male",
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
        gender: "male",
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
      .send({ email: `user0000060@test.local`, password: "User123456" });
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
      .send({ email: "user0000070@test.local", password: "User123456" });
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

    const likePost = await ctx.http
      .post(`/api/news/${news.id}/like`)
      .set("Authorization", `Bearer ${reader.token}`);
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

    const [post, blockCount, postTagCount, postLikeCount, commentCount, commentLikeCount] =
      await Promise.all([
        ctx.prisma.newsPost.findUnique({ where: { id: news.id } }),
        ctx.prisma.newsContentBlock.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsPostTag.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsLike.count({ where: { newsPostId: news.id } }),
        ctx.prisma.comment.count({ where: { newsPostId: news.id } }),
        ctx.prisma.commentLike.count({ where: { commentId: comment.id } }),
      ]);
    expect(post).toBeNull();
    expect(blockCount).toBe(0);
    expect(postTagCount).toBe(0);
    expect(postLikeCount).toBe(0);
    expect(commentCount).toBe(0);
    expect(commentLikeCount).toBe(0);
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

    const beforePublish = await ctx.http
      .get("/api/education/modules")
      .set("Authorization", `Bearer ${reader.token}`);
    expect(beforePublish.body.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http
      .get("/api/education/modules")
      .set("Authorization", `Bearer ${reader.token}`);
    expect(afterPublish.body.find((item: { id: string }) => item.id === moduleId)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http
      .get("/api/education/modules")
      .set("Authorization", `Bearer ${reader.token}`);
    expect(afterUnpublish.body.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

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

    const list = await ctx.http
      .get("/api/education/modules")
      .set("Authorization", `Bearer ${reader.token}`);
    const item = list.body.find((module: { id: string }) => module.id === moduleId);
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
        coverImageId: "test-learning-cover",
        accessLevel: "extended",
        preview: { promotionalDescription: "Превью после", whatYouWillLearn: ["Пункт 1", "Пункт 2"] },
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Модуль после");
    expect(patched.body.coverImageId).toBe("test-learning-cover");
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
    expect(findIndex(beforePublish.body)).toBe(false);

    const publish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterPublish.body)).toBe(true);

    const unpublish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterUnpublish.body)).toBe(false);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/${indexId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const found = await ctx.prisma.priceIndex.findUnique({ where: { id: indexId } });
    expect(found).toBeNull();
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

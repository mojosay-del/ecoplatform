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

  it("не позволяет пользователю поставить лайк своему комментарию", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000024");
    const news = await createPublishedNews(adminToken, "own-comment-like");

    const comment = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Свой комментарий без лайка" });
    expect(comment.status).toBe(201);

    const like = await ctx.http
      .post(`/api/news/comments/${comment.body.id}/like`)
      .set("Authorization", `Bearer ${author.token}`);
    expect(like.status).toBe(403);
    expect(await ctx.prisma.commentLike.count({ where: { commentId: comment.body.id } })).toBe(0);
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
    const adminUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const a = await registerCompany("0000030");
    const b = await registerCompany("0000031");

    // A создаёт тикет
    const t = await ctx.http
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ category: "technical", subject: "Тест", text: "Описание" });
    expect(t.status).toBe(201);
    const ticketId = t.body.id as string;

    await ctx.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorId: adminUser.id,
        authorRole: "admin",
        text: "Внутренняя заметка поддержки",
        isInternal: true,
      },
    });

    // A видит в своём списке
    const listA = await ctx.http.get("/api/support/tickets").set("Authorization", `Bearer ${a.token}`);
    expect(listA.body.items.some((x: { id: string }) => x.id === ticketId)).toBe(true);
    const ownTicket = listA.body.items.find((x: { id: string }) => x.id === ticketId);
    expect(ownTicket.messages.some((m: { text: string }) => m.text === "Внутренняя заметка поддержки")).toBe(false);
    expect(ownTicket.messages.every((m: { authorId?: string; ticketId?: string }) => !m.authorId && !m.ticketId)).toBe(
      true,
    );

    // B не видит
    const listB = await ctx.http.get("/api/support/tickets").set("Authorization", `Bearer ${b.token}`);
    expect(listB.body.items.some((x: { id: string }) => x.id === ticketId)).toBe(false);

    // B пытается ответить — 404 (защита через companyId-фильтр)
    const foreign = await ctx.http
      .post(`/api/support/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${b.token}`)
      .send({ text: "должно быть запрещено" });
    expect(foreign.status).toBe(404);

    const ownReply = await ctx.http
      .post(`/api/support/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${a.token}`)
      .send({ text: "Ответ клиента" });
    expect(ownReply.status).toBe(201);
    expect(ownReply.body.messages.some((m: { text: string }) => m.text === "Внутренняя заметка поддержки")).toBe(false);

    // Админ может ответить любому
    const adminReply = await ctx.http
      .post(`/api/admin/support/tickets/${ticketId}/replies`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ text: "Ответ админа" });
    expect(adminReply.status).toBe(201);
    expect(adminReply.body.messages.some((m: { isInternal: boolean }) => m.isInternal)).toBe(true);
    expect(
      adminReply.body.messages.some(
        (m: { authorRole: string; text: string }) => m.authorRole === "admin" && m.text === "Ответ админа",
      ),
    ).toBe(true);
  });

  it("валидирует pagination query и пустые сообщения на границе API", async () => {
    const adminToken = await loginAdmin();
    const a = await registerCompany("0000032");

    const badOwnList = await ctx.http.get("/api/support/tickets?limit=abc").set("Authorization", `Bearer ${a.token}`);
    expect(badOwnList.status).toBe(400);

    const badAdminList = await ctx.http
      .get("/api/admin/support/tickets?limit=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(badAdminList.status).toBe(400);

    const blankTicket = await ctx.http
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ category: "technical", subject: "   ", text: "Описание" });
    expect(blankTicket.status).toBe(400);

    const ticket = await ctx.http
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ category: "technical", subject: "Тема", text: "Описание" });
    expect(ticket.status).toBe(201);

    const blankReply = await ctx.http
      .post(`/api/support/tickets/${ticket.body.id}/replies`)
      .set("Authorization", `Bearer ${a.token}`)
      .send({ text: "   " });
    expect(blankReply.status).toBe(400);
  });
});

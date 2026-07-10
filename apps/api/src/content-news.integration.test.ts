import { describe, expect, it } from "vitest";
import { CompanyStatus, NewsAccessTier, SubscriptionPlan, type Prisma } from "@prisma/client";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, loginContentManager, registerCompany, createPublishedNewsWithComment, createCoverAsset } = ctx;

describe("Content lifecycle: news", () => {
  it("публичный поиск новостей находит публикации по тегу", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800102");
    const marketNews = await ctx.createPublishedNews(adminToken, "public-search-market", ["рынок"]);
    const otherNews = await ctx.createPublishedNews(adminToken, "public-search-other", ["экспорт"]);

    const response = await ctx.http.get("/api/news?q=рынок").set("Authorization", `Bearer ${reader.token}`);

    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(marketNews.id);
    expect(ids).not.toContain(otherNews.id);
  });

  it("публичная detail-выдача повторно санитизирует legacy paragraph HTML из БД", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800103");
    const news = await ctx.createPublishedNews(adminToken, "legacy-unsafe-html", ["security"]);
    const block = await ctx.prisma.newsContentBlock.findFirstOrThrow({
      where: { newsPostId: news.id, type: "paragraph" },
    });
    await ctx.prisma.newsContentBlock.update({
      where: { id: block.id },
      data: {
        payload: {
          html: '<p onclick="alert(1)">Текст</p><script>alert(1)</script><a href="javascript:alert(1)" target="_blank">bad</a>',
        } as Prisma.InputJsonValue,
      },
    });

    const response = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${reader.token}`);

    expect(response.status).toBe(200);
    const paragraph = response.body.blocks.find((item: { type: string }) => item.type === "paragraph");
    expect(paragraph.payload.html).toBe('<p>Текст</p><a target="_blank" rel="noopener noreferrer">bad</a>');
  });

  it("delete новости полностью удаляет её и связанные данные", async () => {
    const adminToken = await loginAdmin();
    const contentManagerToken = await loginContentManager();
    const author = await registerCompany("0800001");
    const reader = await registerCompany("0800091");
    const { news, comment } = await createPublishedNewsWithComment(adminToken, author.token);

    const likePost = await ctx.http.post(`/api/news/${news.id}/like`).set("Authorization", `Bearer ${reader.token}`);
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

    const [post, blockCount, postTagCount, postLikeCount, commentCount, commentLikeCount, discussionCount] =
      await Promise.all([
        ctx.prisma.newsPost.findUnique({ where: { id: news.id } }),
        ctx.prisma.newsContentBlock.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsPostTag.count({ where: { newsPostId: news.id } }),
        ctx.prisma.newsLike.count({ where: { newsPostId: news.id } }),
        // Comment теперь живёт в Discussion(news_post, news.id) — каскад
        // через Discussion должен снести и комментарии тоже.
        ctx.prisma.comment.count({
          where: { discussion: { targetType: "news_post", targetId: news.id } },
        }),
        ctx.prisma.commentLike.count({ where: { commentId: comment.id } }),
        ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: news.id } }),
      ]);
    expect(post).toBeNull();
    expect(blockCount).toBe(0);
    expect(postTagCount).toBe(0);
    expect(postLikeCount).toBe(0);
    expect(commentCount).toBe(0);
    expect(commentLikeCount).toBe(0);
    expect(discussionCount).toBe(0);
  });
});

describe("Content access tiers: news", () => {
  it("скрывает расширенные новости от basic, но открывает extended, demo и staff", async () => {
    const adminToken = await loginAdmin();
    const basicReader = await registerCompany("0800201");
    const extendedReader = await registerCompany("0800202");
    const demoReader = await registerCompany("0800203");
    const subscriptionEndsAt = new Date("2099-01-01T00:00:00.000Z");
    await Promise.all([
      ctx.prisma.company.update({
        where: { id: basicReader.companyId },
        data: {
          status: CompanyStatus.active,
          demoEndsAt: null,
          subscriptionPlan: SubscriptionPlan.basic,
          subscriptionEndsAt,
        },
      }),
      ctx.prisma.company.update({
        where: { id: extendedReader.companyId },
        data: {
          status: CompanyStatus.active,
          demoEndsAt: null,
          subscriptionPlan: SubscriptionPlan.extended,
          subscriptionEndsAt,
        },
      }),
    ]);
    const [basicLogin, extendedLogin] = await Promise.all([
      ctx.http.post("/api/auth/login").send({
        email: "user0800201@test.local",
        password: "User12345678",
      }),
      ctx.http.post("/api/auth/login").send({
        email: "user0800202@test.local",
        password: "User12345678",
      }),
    ]);
    expect(basicLogin.status).toBe(201);
    expect(extendedLogin.status).toBe(201);
    const basicToken = basicLogin.body.accessToken as string;
    const extendedToken = extendedLogin.body.accessToken as string;

    const tag = "tier-access-news";
    const basicDraft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Базовая новость для матрицы доступа",
        lead: "Доступна всем активным подпискам.",
        blocks: [{ type: "paragraph", payload: { html: "<p>Базовый текст.</p>" } }],
        tags: [tag],
      });
    expect(basicDraft.status).toBe(201);
    expect(basicDraft.body.accessTier).toBe("basic");

    const extendedDraft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Расширенная новость для матрицы доступа",
        lead: "Доступна расширенному тарифу и демо.",
        blocks: [{ type: "paragraph", payload: { html: "<p>Расширенный текст.</p>" } }],
        tags: [tag],
      });
    expect(extendedDraft.status).toBe(201);
    expect(extendedDraft.body.accessTier).toBe("basic");

    const extendedPatched = await ctx.http
      .patch(`/api/admin/content/news/${extendedDraft.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: extendedDraft.body.title,
        lead: extendedDraft.body.lead,
        accessTier: NewsAccessTier.extended,
        blocks: [{ type: "paragraph", payload: { html: "<p>Расширенный текст.</p>" } }],
        tags: [tag],
      });
    expect(extendedPatched.status).toBe(200);
    expect(extendedPatched.body.accessTier).toBe("extended");

    const [basicNews, extendedNews] = await Promise.all([
      ctx.http
        .post(`/api/admin/content/news/${basicDraft.body.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`),
      ctx.http
        .post(`/api/admin/content/news/${extendedDraft.body.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`),
    ]);
    expect(basicNews.status).toBe(201);
    expect(extendedNews.status).toBe(201);

    const filteredPath = `/api/news?tags%5B%5D=${encodeURIComponent(tag)}`;
    const [basicList, extendedList, demoList, staffList] = await Promise.all([
      ctx.http.get(filteredPath).set("Authorization", `Bearer ${basicToken}`),
      ctx.http.get(filteredPath).set("Authorization", `Bearer ${extendedToken}`),
      ctx.http.get(filteredPath).set("Authorization", `Bearer ${demoReader.token}`),
      ctx.http.get(filteredPath).set("Authorization", `Bearer ${adminToken}`),
    ]);
    expect(basicList.body.total).toBe(1);
    expect(basicList.body.items.map((item: { id: string }) => item.id)).toEqual([basicDraft.body.id]);
    for (const response of [extendedList, demoList, staffList]) {
      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.items.map((item: { id: string }) => item.id)).toContain(extendedDraft.body.id);
    }

    const searchQuery = encodeURIComponent("Расширенная новость для матрицы доступа");
    const [basicFirstPage, extendedFirstPage, basicSearch, extendedSearch] = await Promise.all([
      ctx.http.get(`${filteredPath}&limit=1`).set("Authorization", `Bearer ${basicToken}`),
      ctx.http.get(`${filteredPath}&limit=1`).set("Authorization", `Bearer ${extendedToken}`),
      ctx.http.get(`/api/news?q=${searchQuery}`).set("Authorization", `Bearer ${basicToken}`),
      ctx.http.get(`/api/news?q=${searchQuery}`).set("Authorization", `Bearer ${extendedToken}`),
    ]);
    expect(basicFirstPage.body).toMatchObject({ total: 1, hasMore: false });
    expect(extendedFirstPage.body).toMatchObject({ total: 2, hasMore: true });
    expect(basicSearch.body).toMatchObject({ total: 0, hasMore: false });
    expect(extendedSearch.body).toMatchObject({ total: 1, hasMore: false });
    expect(extendedSearch.body.items).toContainEqual(expect.objectContaining({ id: extendedDraft.body.id }));

    const [basicDetail, extendedDetail, demoDetail] = await Promise.all([
      ctx.http.get(`/api/news/${extendedDraft.body.slug}`).set("Authorization", `Bearer ${basicToken}`),
      ctx.http.get(`/api/news/${extendedDraft.body.slug}`).set("Authorization", `Bearer ${extendedToken}`),
      ctx.http.get(`/api/news/${extendedDraft.body.slug}`).set("Authorization", `Bearer ${demoReader.token}`),
    ]);
    expect(basicDetail.status).toBe(404);
    expect(basicDetail.body.message).toBe("Новость не найдена.");
    expect(extendedDetail.body.accessTier).toBe("extended");
    expect(demoDetail.body.accessTier).toBe("extended");

    const comment = await ctx.http
      .post(`/api/news/${extendedDraft.body.id}/comments`)
      .set("Authorization", `Bearer ${demoReader.token}`)
      .send({ text: "Комментарий из демо." });
    expect(comment.status).toBe(201);

    const [basicPostLike, basicComment, basicCommentLike] = await Promise.all([
      ctx.http.post(`/api/news/${extendedDraft.body.id}/like`).set("Authorization", `Bearer ${basicToken}`),
      ctx.http
        .post(`/api/news/${extendedDraft.body.id}/comments`)
        .set("Authorization", `Bearer ${basicToken}`)
        .send({ text: "Не должно сохраниться." }),
      ctx.http.post(`/api/news/comments/${comment.body.id}/like`).set("Authorization", `Bearer ${basicToken}`),
    ]);
    expect(basicPostLike.status).toBe(404);
    expect(basicComment.status).toBe(404);
    expect(basicCommentLike.status).toBe(404);

    const [basicTags, extendedTags] = await Promise.all([
      ctx.http.get("/api/news/tags?limit=100").set("Authorization", `Bearer ${basicToken}`),
      ctx.http.get("/api/news/tags?limit=100").set("Authorization", `Bearer ${extendedToken}`),
    ]);
    expect(basicTags.body.find((item: { name: string }) => item.name === tag)?.usageCount).toBe(1);
    expect(extendedTags.body.find((item: { name: string }) => item.name === tag)?.usageCount).toBe(2);

    const audit = await ctx.prisma.adminActionLog.findFirst({
      where: { action: "news.update", entityId: extendedDraft.body.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.payload).toMatchObject({
      diff: { accessTier: { before: "basic", after: "extended" } },
    });
  });
});

describe("Content updates: news", () => {
  it("content manager не может поставить чужой файл как coverImageId", async () => {
    const managerToken = await loginContentManager();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const cover = await createCoverAsset(admin.id, "foreign-news-cover");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        title: "Новость с чужой обложкой",
        lead: "Лид",
        coverImageId: cover.id,
        blocks: [{ type: "paragraph", payload: { html: "<p>Текст.</p>" } }],
        tags: ["security"],
      });

    expect(draft.status).toBe(403);
    expect(draft.body.message).toContain("загруженный вами");
  });

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

  it("принимает крупную статью тела >100 КБ (лимит JSON body-parser поднят)", async () => {
    const adminToken = await loginAdmin();

    // Длинный абзац (~1 КБ безопасного HTML) повторяем в 200 блоков → тело
    // сериализуется в ~200 КБ и заведомо превышает дефолтные 100 КБ Express.
    // Без поднятого лимита (app.useBodyParser json 2mb) запрос вернул бы 413.
    const longParagraph = `<p>${"Абзац с содержательным текстом для проверки лимита тела запроса. ".repeat(15)}</p>`;
    const blocks = Array.from({ length: 200 }, () => ({
      type: "paragraph" as const,
      payload: { html: longParagraph },
    }));

    const payloadBytes = Buffer.byteLength(JSON.stringify({ blocks }), "utf8");
    expect(payloadBytes).toBeGreaterThan(100 * 1024);

    const largeDraft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Крупная статья для проверки лимита тела",
        lead: "Тело статьи превышает дефолтные 100 КБ Express.",
        blocks,
        tags: ["большое-тело"],
      });

    expect(largeDraft.status).toBe(201);
    expect(largeDraft.body.blocks).toHaveLength(200);
  });
});

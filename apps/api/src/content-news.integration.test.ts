import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
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
});

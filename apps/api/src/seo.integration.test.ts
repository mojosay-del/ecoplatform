import { ContentStatus, FileAccessLevel, ForumQuestionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, createPublishedKnowledgeArticle } = ctx;

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function installFakePublicS3Env() {
  const previous = {
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
  };
  process.env.S3_PUBLIC_BASE_URL = "https://cdn.ecoplatform.test";
  process.env.S3_ENDPOINT = "https://s3.ecoplatform.test";
  process.env.S3_BUCKET = "seo-public-bucket";

  return () => {
    restoreEnv("S3_PUBLIC_BASE_URL", previous.S3_PUBLIC_BASE_URL);
    restoreEnv("S3_ENDPOINT", previous.S3_ENDPOINT);
    restoreEnv("S3_BUCKET", previous.S3_BUCKET);
  };
}

async function adminId() {
  const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
  return admin.id;
}

async function createNews(adminToken: string, input: { title: string; coverImageId?: string | null }) {
  const draft = await ctx.http
    .post("/api/admin/content/news")
    .set(auth(adminToken))
    .send({
      title: input.title,
      lead: `Лид: ${input.title}`,
      coverImageId: input.coverImageId ?? null,
      blocks: [{ type: "paragraph", payload: { html: `<p>${input.title}</p>` } }],
      tags: ["seo"],
    });
  expect(draft.status).toBe(201);
  return draft.body as { id: string; slug: string; title: string };
}

async function publishNews(adminToken: string, id: string) {
  const published = await ctx.http.post(`/api/admin/content/news/${id}/publish`).set(auth(adminToken));
  expect(published.status).toBe(201);
  return published.body as { id: string; slug: string; title: string };
}

async function createSeededNews(
  createdById: string,
  input: { title: string; slug: string; coverImageId?: string | null; status?: ContentStatus },
) {
  const status = input.status ?? ContentStatus.published;
  return ctx.prisma.newsPost.create({
    data: {
      title: input.title,
      lead: `Лид: ${input.title}`,
      slug: input.slug,
      coverImageId: input.coverImageId ?? null,
      status,
      firstPublishedAt: status === ContentStatus.published ? new Date("2026-06-01T00:00:00.000Z") : null,
      createdById,
      blocks: {
        create: [{ position: 0, type: "paragraph", payload: { html: `<p>${input.title}</p>` } }],
      },
    },
    select: { id: true, slug: true, title: true },
  });
}

async function createPublishedDocument(adminToken: string, fileId: string) {
  const draft = await ctx.http.post("/api/admin/content/documentation").set(auth(adminToken)).send({
    title: "SEO-документ",
    subtitle: "Проверка документации в sitemap",
    position: 0,
    fileAssetId: fileId,
    blocks: [],
  });
  expect(draft.status).toBe(201);

  const published = await ctx.http
    .post(`/api/admin/content/documentation/${draft.body.id}/publish`)
    .set(auth(adminToken));
  expect(published.status).toBe(201);
  return published.body as { id: string; slug: string; title: string };
}

describe("SEO public API", () => {
  it("отдаёт sitemap анониму и скрывает draft/hidden сущности", async () => {
    const adminToken = await loginAdmin();
    const user = await registerCompany("1300001");
    const publicNews = await publishNews(adminToken, (await createNews(adminToken, { title: "SEO public news" })).id);
    const draftNews = await createNews(adminToken, { title: "SEO draft news" });
    const knowledge = await createPublishedKnowledgeArticle(adminToken, "seo-public");
    const draftKnowledge = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set(auth(adminToken))
      .send({
        title: "SEO draft knowledge",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>draft</p>" } }],
      });
    expect(draftKnowledge.status).toBe(201);

    const documentFile = await ctx.prisma.fileAsset.create({
      data: {
        originalName: "seo-doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        storageKey: "private/seo-doc.pdf",
        accessLevel: FileAccessLevel.authenticated,
        uploadedById: await adminId(),
      },
    });
    const document = await createPublishedDocument(adminToken, documentFile.id);

    const visibleQuestion = await ctx.prisma.forumQuestion.create({
      data: {
        authorId: user.userId,
        authorCompanyId: user.companyId,
        title: "SEO visible forum question",
        body: "Вопрос, который можно индексировать как read-only summary.",
      },
    });
    const hiddenQuestion = await ctx.prisma.forumQuestion.create({
      data: {
        authorId: user.userId,
        authorCompanyId: user.companyId,
        title: "SEO hidden forum question",
        body: "Скрытый вопрос.",
        status: ForumQuestionStatus.hidden,
      },
    });

    const response = await ctx.http.get("/api/seo/sitemap");

    expect(response.status).toBe(200);
    const paths = response.body.items.map((item: { path: string }) => item.path);
    expect(paths).toContain(`/news/${publicNews.slug}`);
    expect(paths).toContain(`/knowledge-base/${knowledge.slug}`);
    expect(paths).toContain(`/documentation/${document.slug}`);
    expect(paths).toContain(`/forum/q/${visibleQuestion.id}`);
    expect(paths).not.toContain(`/news/${draftNews.slug}`);
    expect(paths).not.toContain(`/knowledge-base/${draftKnowledge.body.slug}`);
    expect(paths).not.toContain(`/forum/q/${hiddenQuestion.id}`);
  });

  it("отдаёт page metadata без auth и не раскрывает приватные file URL", async () => {
    const restoreEnv = installFakePublicS3Env();
    try {
      const uploaderId = await adminId();
      const publicCover = await ctx.prisma.fileAsset.create({
        data: {
          originalName: "public-cover.webp",
          mimeType: "image/webp",
          sizeBytes: 1200,
          storageKey: "covers/public-cover.webp",
          accessLevel: FileAccessLevel.public,
          uploadedById: uploaderId,
        },
      });
      const privateCover = await ctx.prisma.fileAsset.create({
        data: {
          originalName: "private-cover.webp",
          mimeType: "image/webp",
          sizeBytes: 1200,
          storageKey: "covers/private-cover.webp",
          accessLevel: FileAccessLevel.authenticated,
          uploadedById: uploaderId,
        },
      });
      const publicNews = await createSeededNews(uploaderId, {
        title: "SEO public cover",
        slug: "seo-public-cover",
        coverImageId: publicCover.id,
      });
      const privateNews = await createSeededNews(uploaderId, {
        title: "SEO private cover",
        slug: "seo-private-cover",
        coverImageId: privateCover.id,
      });
      const draftNews = await createSeededNews(uploaderId, {
        title: "SEO page draft",
        slug: "seo-page-draft",
        status: ContentStatus.draft,
      });

      const publicMeta = await ctx.http.get("/api/seo/pages").query({ path: `/news/${publicNews.slug}` });
      const privateMeta = await ctx.http.get("/api/seo/pages").query({ path: `/news/${privateNews.slug}` });
      const draftMeta = await ctx.http.get("/api/seo/pages").query({ path: `/news/${draftNews.slug}` });

      expect(publicMeta.status).toBe(200);
      expect(publicMeta.body).toMatchObject({
        type: "news",
        path: `/news/${publicNews.slug}`,
        title: "SEO public cover",
        imageUrl: "https://cdn.ecoplatform.test/seo-public-bucket/covers/public-cover.webp",
      });
      expect(privateMeta.status).toBe(200);
      expect(privateMeta.body.imageUrl).toBeNull();
      expect(JSON.stringify(privateMeta.body)).not.toContain("private-cover.webp");
      expect(draftMeta.status).toBe(404);
    } finally {
      restoreEnv();
    }
  });
});

function restoreEnv(key: "S3_PUBLIC_BASE_URL" | "S3_ENDPOINT" | "S3_BUCKET", value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

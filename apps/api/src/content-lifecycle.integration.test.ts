import type { IncomingMessage } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import {
  CommentStatus,
  CompanyRole,
  CompanyStatus,
  CompanyType,
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

describe("Content lifecycle: news", () => {
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

  it("создаёт и публикует категорию базы знаний с пустыми блоками", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800003");

    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория БЗ без блоков",
        position: 0,
        iconType: "category",
        blocks: [],
      });
    expect(category.status).toBe(201);

    const publish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${category.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);
    expect(publish.body.status).toBe("published");

    const tree = await ctx.http.get("/api/knowledge-base?depth=1").set("Authorization", `Bearer ${reader.token}`);
    expect(tree.body.find((item: { id: string }) => item.id === category.body.id)).toBeTruthy();
  });

  it("сохраняет пустой материал как черновик, но запрещает публикацию без блоков", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория для пустого материала",
        position: 0,
        iconType: "category",
        blocks: [],
      });
    expect(category.status).toBe(201);

    const material = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Пустой черновик БЗ",
        position: 0,
        blocks: [],
      });
    expect(material.status).toBe(201);
    expect(material.body.status).toBe("draft");

    const publish = await ctx.http
      .post(`/api/admin/content/knowledge-base/${material.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(403);
  });

  it("перемещает материалы внутри одной категории и отдаёт новый порядок", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Категория для сортировки материалов",
        position: 0,
        iconType: "category",
        blocks: [],
      });
    expect(category.status).toBe(201);

    const first = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Материал БЗ 1",
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Первый.</p>" } }],
      });
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentId: category.body.id,
        title: "Материал БЗ 2",
        position: 1,
        blocks: [{ type: "paragraph", payload: { html: "<p>Второй.</p>" } }],
      });
    expect(second.status).toBe(201);

    const move = await ctx.http
      .patch(`/api/admin/content/knowledge-base/${second.body.id}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ parentId: category.body.id, position: 0 });
    expect(move.status).toBe(200);

    const list = await ctx.http
      .get("/api/admin/content/knowledge-base?limit=200")
      .set("Authorization", `Bearer ${adminToken}`);
    const materials = list.body.items
      .filter((item: { parentId: string | null }) => item.parentId === category.body.id)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position);
    expect(materials.map((item: { id: string }) => item.id)).toEqual([second.body.id, first.body.id]);
    expect(materials.map((item: { position: number }) => item.position)).toEqual([0, 1]);
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

  async function registerCompanyByType(suffix: string, companyType: CompanyType): Promise<string> {
    return registerWithBody({
      organizationName: `ООО ${companyType} ${suffix}`,
      companyType,
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: `+7900${suffix}`,
      email: `${companyType}${suffix}@test.local`,
      password: "User12345678",
    });
  }

  it("publish модуля делает его видимым в публичной выдаче, unpublish — скрывает, delete — удаляет", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800010");
    const { moduleId } = await createLearningModuleWithLesson(adminToken, "lifecycle");

    const beforePublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(beforePublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(afterPublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeTruthy();

    const unpublish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    expect(afterUnpublish.body.items.find((item: { id: string }) => item.id === moduleId)).toBeUndefined();

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

    const list = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    const item = list.body.items.find((module: { id: string }) => module.id === moduleId);
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

  it("публичное обучение доступно обычным пользователям только для типа компании заготовитель", async () => {
    const adminToken = await loginAdmin();
    const collector = await registerCompany("0800012");
    const traderToken = await registerCompanyByType("0800013", CompanyType.trader);
    const processorToken = await registerCompanyByType("0800014", CompanyType.processor);
    const { moduleId, lessonId } = await createLearningModuleWithLesson(adminToken, "company-type-access");

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const collectorList = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${collector.token}`);
    expect(collectorList.status).toBe(200);
    expect(collectorList.body.items.find((item: { id: string }) => item.id === moduleId)).toBeTruthy();

    for (const token of [traderToken, processorToken]) {
      const list = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${token}`);
      expect(list.status).toBe(403);
      expect(list.body.message).toContain("только заготовителям");

      const detail = await ctx.http.get(`/api/education/modules/${moduleId}`).set("Authorization", `Bearer ${token}`);
      expect(detail.status).toBe(403);
      expect(detail.body.message).toContain("только заготовителям");

      const complete = await ctx.http
        .post(`/api/education/lessons/${lessonId}/complete`)
        .set("Authorization", `Bearer ${token}`);
      expect(complete.status).toBe(403);
      expect(complete.body.message).toContain("только заготовителям");
    }
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

  it("PATCH модуля обновляет accessLevel и preview", async () => {
    const adminToken = await loginAdmin();
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const cover = await createCoverAsset(admin.id, "learning-cover");
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
        coverImageId: cover.id,
        accessLevel: "extended",
        preview: { promotionalDescription: "Превью после", whatYouWillLearn: ["Пункт 1", "Пункт 2"] },
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Модуль после");
    expect(patched.body.coverImageId).toBe(cover.id);
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
    const admin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
    const cover = await createCoverAsset(admin.id, "lesson-cover");
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
        coverImageId: cover.id,
        coverSubtitle: "Организация склада",
        blocks: [
          { type: "heading", payload: { text: "Глава" } },
          { type: "paragraph", payload: { html: "<p>Версия 2</p>" } },
        ],
      });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Урок v2");
    expect(patched.body.coverImageId).toBe(cover.id);
    expect(patched.body.coverSubtitle).toBe("Организация склада");

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

    const reference = await ctx.prisma.fileReference.findFirst({
      where: { entityType: "learning_module", entityId: moduleRes.body.id, fileId: cover.id },
    });
    expect(reference).toBeTruthy();

    const reader = await registerCompany("0800012");
    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleRes.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const publicDetail = await ctx.http
      .get(`/api/education/modules/${moduleRes.body.id}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(publicDetail.body.chapters[0].lessons[0].coverImageId).toBe(cover.id);
    expect(publicDetail.body.chapters[0].lessons[0].coverSubtitle).toBe("Организация склада");
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

  it("move номенклатуры меняет порядок внутри категории в админке и на /indices", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800019");
    const category = await ctx.http
      .post("/api/admin/content/indices/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Категория reorder", position: 0 });
    expect(category.status).toBe(201);

    async function createPublishedNomenclature(code: string, name: string, price: number) {
      const nomenclature = await ctx.http
        .post("/api/admin/content/indices/nomenclature")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ categoryId: category.body.id, code, name });
      expect(nomenclature.status).toBe(201);

      const indexRes = await ctx.http
        .post("/api/admin/content/indices")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ nomenclatureId: nomenclature.body.id });
      expect(indexRes.status).toBe(201);

      const valueRes = await ctx.http
        .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ date: "2026-05-19T00:00:00.000Z", price });
      expect(valueRes.status).toBe(201);

      const publish = await ctx.http
        .post(`/api/admin/content/indices/${indexRes.body.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(publish.status).toBe(201);

      return nomenclature.body.id as string;
    }

    const firstId = await createPublishedNomenclature("REORDER-1", "Первая", 12000);
    const secondId = await createPublishedNomenclature("REORDER-2", "Вторая", 13000);
    const thirdId = await createPublishedNomenclature("REORDER-3", "Третья", 14000);

    const move = await ctx.http
      .patch(`/api/admin/content/indices/nomenclature/${thirdId}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ categoryId: category.body.id, position: 0 });
    expect(move.status).toBe(200);
    expect(move.body.position).toBe(0);

    const adminList = await ctx.http.get("/api/admin/content/indices").set("Authorization", `Bearer ${adminToken}`);
    const adminCategory = adminList.body.items.find((item: { id: string }) => item.id === category.body.id);
    expect(adminCategory.nomenclatures.map((item: { id: string }) => item.id)).toEqual([thirdId, firstId, secondId]);

    const publicList = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    const publicCategory = publicList.body.items.find((item: { id: string }) => item.id === category.body.id);
    expect(publicCategory.nomenclatures.map((item: { id: string }) => item.id)).toEqual([thirdId, firstId, secondId]);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: thirdId, action: "indices.nomenclature.move" },
    });
    expect(log?.payload).toMatchObject({
      from: { categoryId: category.body.id, position: 2 },
      to: { categoryId: category.body.id, position: 0 },
    });
  });

  it("publish индекса делает его видимым в /indices, unpublish скрывает, delete удаляет", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800020");
    const { indexId, nomenclatureId } = await createPriceIndexWithValue(adminToken, "lifecycle");

    const beforePublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    const findIndex = (body: Array<{ nomenclatures: Array<{ id: string }> }>) =>
      body.some((cat) => cat.nomenclatures.some((nom) => nom.id === nomenclatureId));
    expect(findIndex(beforePublish.body.items)).toBe(false);

    const publish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterPublish.body.items)).toBe(true);

    const unpublish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterUnpublish.body.items)).toBe(false);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/${indexId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const found = await ctx.prisma.priceIndex.findUnique({ where: { id: indexId } });
    expect(found).toBeNull();
  });

  it("add/update значения индекса валидирует индекс и пишет audit log", async () => {
    const adminToken = await loginAdmin();
    const category = await ctx.http
      .post("/api/admin/content/indices/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Категория audit value", position: 0 });
    expect(category.status).toBe(201);

    const nomenclature = await ctx.http
      .post("/api/admin/content/indices/nomenclature")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: category.body.id,
        code: "AUDIT-VALUE",
        name: "Номенклатура audit value",
      });
    expect(nomenclature.status).toBe(201);

    const indexRes = await ctx.http
      .post("/api/admin/content/indices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nomenclatureId: nomenclature.body.id });
    expect(indexRes.status).toBe(201);

    const missing = await ctx.http
      .post("/api/admin/content/indices/missing-index/values")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(missing.status).toBe(404);

    const created = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(created.status).toBe(201);

    const updated = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 13000 });
    expect(updated.status).toBe(201);
    expect(updated.body.id).toBe(created.body.id);

    const logs = await ctx.prisma.adminActionLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((log) => log.action)).toEqual(["indices.value.create", "indices.value.update"]);
    expect(logs[1]?.payload).toMatchObject({ beforePrice: "12000", afterPrice: "13000" });
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

// Юридические документы и согласия (Волна 6.2). Документы создаются вручную
// в каждом тесте, потому что resetDb чистит ВСЕ таблицы (включая LegalDocument);
// глобального seed для тестов нет.

import { CompanyType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, registerWithBody, createCoverAsset } = ctx;

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

    const collectorList = await ctx.http
      .get("/api/education/modules")
      .set("Authorization", `Bearer ${collector.token}`);
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

  it("список отдаёт длительности и прогресс, complete сдвигает nextLessonId", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800015");

    const moduleRes = await ctx.http
      .post("/api/admin/content/education/modules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Модуль с прогрессом",
        summary: "Краткое",
        description: "Полное",
        accessLevel: "basic",
        preview: { promotionalDescription: "Превью", whatYouWillLearn: [] },
        chapters: [],
      });
    expect(moduleRes.status).toBe(201);
    const moduleId = moduleRes.body.id as string;

    // 360 слов при 180 wpm = 2 минуты чтения.
    const longHtml = `<p>${Array.from({ length: 360 }, (_, index) => `слово${index}`).join(" ")}</p>`;
    const lessonIds: string[] = [];
    for (const [chapterIndex, lessons] of [
      [
        { title: "Длинный урок", blocks: [{ type: "paragraph", payload: { html: longHtml } }] },
        { title: "Короткий урок", blocks: [{ type: "paragraph", payload: { html: "<p>Пара слов.</p>" } }] },
      ],
      [
        {
          title: "Квиз",
          blocks: [
            {
              type: "quiz",
              payload: {
                question: "Вопрос?",
                multiple: false,
                options: [
                  { text: "Да", correct: true },
                  { text: "Нет", correct: false },
                ],
              },
            },
          ],
        },
      ],
    ].entries()) {
      const chapterRes = await ctx.http
        .post(`/api/admin/content/education/modules/${moduleId}/chapters`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ title: `Глава ${chapterIndex + 1}`, position: chapterIndex });
      expect(chapterRes.status).toBe(201);
      for (const [lessonIndex, lesson] of lessons.entries()) {
        const lessonRes = await ctx.http
          .post(`/api/admin/content/education/chapters/${chapterRes.body.id}/lessons`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ title: lesson.title, position: lessonIndex, blocks: lesson.blocks, attachments: [] });
        expect(lessonRes.status).toBe(201);
        lessonIds.push(lessonRes.body.id as string);
      }
    }

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    // Свежий прогресс: 0 из 3, «продолжить» указывает на первый урок.
    const listBefore = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    const itemBefore = listBefore.body.items.find((item: { id: string }) => item.id === moduleId);
    expect(itemBefore).toMatchObject({
      totalLessons: 3,
      // 2 мин (длинный) + 1 мин (короткий) + ceil(45+2*10=65с)=2 мин (квиз).
      totalEstimatedMinutes: 5,
      progress: { completedLessons: 0, totalLessons: 3, percent: 0 },
      nextLessonId: lessonIds[0],
      lastActivityAt: null,
    });

    const complete = await ctx.http
      .post(`/api/education/lessons/${lessonIds[0]}/complete`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(complete.status).toBe(201);

    const listAfter = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    const itemAfter = listAfter.body.items.find((item: { id: string }) => item.id === moduleId);
    expect(itemAfter).toMatchObject({
      progress: { completedLessons: 1, totalLessons: 3, percent: 33 },
      nextLessonId: lessonIds[1],
    });
    expect(itemAfter.lastActivityAt).toBeTruthy();

    const detail = await ctx.http
      .get(`/api/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.totalEstimatedMinutes).toBe(5);
    expect(detail.body.nextLessonId).toBe(lessonIds[1]);
    expect(detail.body.chapters[0].lessons[0].estimatedMinutes).toBe(2);
    expect(detail.body.chapters[1].lessons[0].estimatedMinutes).toBe(2);
  });

  it("без доступа список не отдаёт прогресс, но длительности и программа видны", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800016");
    const { moduleId } = await createLearningModuleWithLesson(adminToken, "locked-durations");

    const markExtended = await ctx.http
      .patch(`/api/admin/content/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessLevel: "extended" });
    expect(markExtended.status).toBe(200);

    const publish = await ctx.http
      .post(`/api/admin/content/education/modules/${moduleId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const list = await ctx.http.get("/api/education/modules").set("Authorization", `Bearer ${reader.token}`);
    const item = list.body.items.find((module: { id: string }) => module.id === moduleId);
    expect(item).toMatchObject({
      hasAccess: false,
      totalLessons: 1,
      progress: null,
      nextLessonId: null,
      lastActivityAt: null,
    });
    expect(item.totalEstimatedMinutes).toBeGreaterThanOrEqual(1);

    // Программа (названия уроков + оценка времени) доступна и без подписки —
    // контент-блоки при этом по-прежнему отрезаны.
    const detail = await ctx.http
      .get(`/api/education/modules/${moduleId}`)
      .set("Authorization", `Bearer ${reader.token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.hasAccess).toBe(false);
    expect(detail.body.progress).toBeNull();
    expect(detail.body.chapters[0].lessons[0].title).toBe("Урок 1");
    expect(detail.body.chapters[0].lessons[0].estimatedMinutes).toBeGreaterThanOrEqual(1);
    expect(detail.body.chapters[0].lessons[0].blocks).toBeUndefined();
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

describe("Content updates: learning", () => {
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

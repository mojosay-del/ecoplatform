import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, loginModerator, registerCompany } = ctx;

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createRawMaterial(adminToken: string, label: string): Promise<string> {
  const res = await ctx.http.post("/api/admin/content/forum/raw-materials").set(auth(adminToken)).send({ label });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createQuestionType(adminToken: string, label: string): Promise<string> {
  const res = await ctx.http.post("/api/admin/content/forum/question-types").set(auth(adminToken)).send({ label });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function ask(
  token: string,
  input: { title: string; body?: string; rawMaterialId: string; questionTypeId: string },
): Promise<string> {
  const res = await ctx.http
    .post("/api/forum/q")
    .set(auth(token))
    .send({ body: "", ...input });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function answer(token: string, questionId: string, body: string): Promise<string> {
  const res = await ctx.http.post(`/api/forum/q/${questionId}/answers`).set(auth(token)).send({ body });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("Forum: полный цикл", () => {
  it("ask → answer → vote → accept → solved → находится поиском", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900001");
    const responder = await registerCompany("0900002");

    const rawMaterialId = await createRawMaterial(adminToken, "Макулатура МС-5Б");
    const questionTypeId = await createQuestionType(adminToken, "Логистика");

    const questionId = await ask(asker.token, {
      title: "Какие документы нужны для межрегиональной перевозки макулатуры",
      body: "Везу МС-5Б из области в соседний регион. Что должно быть у водителя?",
      rawMaterialId,
      questionTypeId,
    });

    // Новый вопрос — статус open, в ленте.
    const open = await ctx.http.get("/api/forum").set(auth(asker.token));
    expect(open.status).toBe(200);
    const openCard = open.body.items.find((item: { id: string }) => item.id === questionId);
    expect(openCard.status).toBe("open");

    const answerId = await answer(responder.token, questionId, "Достаточно ТТН и договора, лицензия не нужна.");

    // Автор вопроса голосует «полезно» за чужой ответ.
    const vote = await ctx.http.post(`/api/forum/answers/${answerId}/vote`).set(auth(asker.token));
    expect(vote.status).toBe(201);
    expect(vote.body).toMatchObject({ voted: true, votesCount: 1 });

    // Автор отмечает решение → solved.
    const accept = await ctx.http.post(`/api/forum/q/${questionId}/accept`).set(auth(asker.token)).send({ answerId });
    expect(accept.status).toBe(201);

    const detail = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("solved");
    expect(detail.body.acceptedAnswerId).toBe(answerId);
    expect(detail.body.answers[0].isAccepted).toBe(true);
    expect(detail.body.answers[0].votesCount).toBe(1);

    // Находится поиском по телу ответа/заголовку.
    const search = await ctx.http.get("/api/forum?q=межрегиональной").set(auth(responder.token));
    expect(search.body.items.some((item: { id: string }) => item.id === questionId)).toBe(true);
  });
});

describe("Forum: права (матрица §4)", () => {
  it("обычный пользователь не может управлять справочниками", async () => {
    const user = await registerCompany("0900010");
    const res = await ctx.http
      .post("/api/admin/content/forum/raw-materials")
      .set(auth(user.token))
      .send({ label: "X" });
    expect(res.status).toBe(403);
  });

  it("решение отмечает только автор вопроса (или стафф)", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900011");
    const responder = await registerCompany("0900012");
    const rawMaterialId = await createRawMaterial(adminToken, "Стекло-бой");
    const questionTypeId = await createQuestionType(adminToken, "Документы");
    const questionId = await ask(asker.token, { title: "Паспорт отхода на стеклобой?", rawMaterialId, questionTypeId });
    const answerId = await answer(responder.token, questionId, "Делается по ФККО на основе протокола КХА.");

    // Не автор (он же ответивший) — нельзя принять решение.
    const forbidden = await ctx.http
      .post(`/api/forum/q/${questionId}/accept`)
      .set(auth(responder.token))
      .send({ answerId });
    expect(forbidden.status).toBe(403);
  });

  it("нельзя голосовать за свой ответ", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900013");
    const responder = await registerCompany("0900014");
    const rawMaterialId = await createRawMaterial(adminToken, "Лом 3А");
    const questionTypeId = await createQuestionType(adminToken, "Цены и рынок");
    const questionId = await ask(asker.token, {
      title: "По какому индексу спорить о цене лома?",
      rawMaterialId,
      questionTypeId,
    });
    const answerId = await answer(responder.token, questionId, "Зашивайте формулу от индекса на дату отгрузки.");

    const selfVote = await ctx.http.post(`/api/forum/answers/${answerId}/vote`).set(auth(responder.token));
    expect(selfVote.status).toBe(400);
  });
});

describe("Forum: таксономия", () => {
  it("удаление значения справочника обнуляет тег, вопрос остаётся (§6)", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900020");
    const rawMaterialId = await createRawMaterial(adminToken, "Плёнка стрейч");
    const questionTypeId = await createQuestionType(adminToken, "Оборудование");
    const questionId = await ask(asker.token, {
      title: "Чем резать стрейч перед прессом?",
      rawMaterialId,
      questionTypeId,
    });

    const del = await ctx.http.delete(`/api/admin/content/forum/raw-materials/${rawMaterialId}`).set(auth(adminToken));
    expect(del.status).toBe(200);
    expect(del.body.affectedQuestions).toBe(1);

    const detail = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(detail.status).toBe(200);
    expect(detail.body.rawMaterial).toBeNull();
    expect(detail.body.questionType.id).toBe(questionTypeId);
  });
});

describe("Forum: закреплённые новости", () => {
  it("новость с флагом pinnedInForum показывается в /forum/pinned-news", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0900030");

    const create = await ctx.http
      .post("/api/admin/content/news")
      .set(auth(adminToken))
      .send({
        title: "Что меняется в РОП с 2026 года",
        lead: "Разбор для заготовителей и переработчиков.",
        pinnedInForum: true,
        blocks: [{ type: "paragraph", payload: { html: "<p>Текст разбора.</p>" } }],
        tags: [],
      });
    expect(create.status).toBe(201);
    const publish = await ctx.http.post(`/api/admin/content/news/${create.body.id}/publish`).set(auth(adminToken));
    expect(publish.status).toBe(201);

    const pinned = await ctx.http.get("/api/forum/pinned-news").set(auth(reader.token));
    expect(pinned.status).toBe(200);
    expect(pinned.body.some((item: { id: string }) => item.id === create.body.id)).toBe(true);
  });
});

describe("Forum: модерация и уведомления", () => {
  it("жалоба на вопрос создаёт кейс модерации, removed → вопрос скрыт", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const asker = await registerCompany("0900040");
    const reporter = await registerCompany("0900041");
    const rawMaterialId = await createRawMaterial(adminToken, "Картон Б/У");
    const questionTypeId = await createQuestionType(adminToken, "Регуляторика");
    const questionId = await ask(asker.token, { title: "Спорный вопрос для модерации", rawMaterialId, questionTypeId });

    const complaint = await ctx.http
      .post("/api/moderation/complaints")
      .set(auth(reporter.token))
      .send({ entityType: "forum_question", entityId: questionId, reasonCode: "spam" });
    expect(complaint.status).toBe(201);

    const moderationCase = await ctx.prisma.moderationCase.findFirst({
      where: { entityType: "forum_question", entityId: questionId },
    });
    expect(moderationCase).not.toBeNull();

    // Модератор берёт кейс и выносит remove_content → вопрос скрыт.
    await ctx.http.post(`/api/admin/moderation/cases/${moderationCase!.id}/lock`).set(auth(moderatorToken));
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${moderationCase!.id}/decisions`)
      .set(auth(moderatorToken))
      .send({ type: "remove_content", reasonCode: "valid_complaint" });
    expect(decision.status).toBe(201);

    const hidden = await ctx.prisma.forumQuestion.findUnique({ where: { id: questionId } });
    expect(hidden?.status).toBe("hidden");

    // Скрытый вопрос недоступен обычному читателю.
    const reader = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(reporter.token));
    expect(reader.status).toBe(404);
  });

  it("новый ответ создаёт in-app уведомление автору вопроса (category=forum)", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900050");
    const responder = await registerCompany("0900051");
    const rawMaterialId = await createRawMaterial(adminToken, "ПЭТ прозрачный");
    const questionTypeId = await createQuestionType(adminToken, "Логистика-2");
    const questionId = await ask(asker.token, { title: "Вопрос для уведомления", rawMaterialId, questionTypeId });
    await answer(responder.token, questionId, "Ответ, который должен породить уведомление.");

    const notification = await ctx.prisma.inAppNotification.findFirst({
      where: { userId: asker.userId, category: "forum", eventType: "forum.answer.created" },
    });
    expect(notification).not.toBeNull();
  });
});

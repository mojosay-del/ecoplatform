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

async function reply(token: string, answerId: string, body: string): Promise<string> {
  const res = await ctx.http.post(`/api/forum/answers/${answerId}/replies`).set(auth(token)).send({ body });
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

    // Summary: общие метрики, профиль текущего пользователя и недельный рейтинг.
    const oldQuestionId = await ask(asker.token, {
      title: "Старый решённый вопрос",
      body: "Решение было принято раньше текущей недели.",
      rawMaterialId,
      questionTypeId,
    });
    const oldAnswerId = await answer(responder.token, oldQuestionId, "Старый лучший ответ.");
    const oldAccept = await ctx.http
      .post(`/api/forum/q/${oldQuestionId}/accept`)
      .set(auth(asker.token))
      .send({ answerId: oldAnswerId });
    expect(oldAccept.status).toBe(201);
    await ctx.prisma.forumQuestion.update({ where: { id: oldQuestionId }, data: { solvedAt: new Date("2020-01-01") } });

    const hiddenQuestionId = await ask(asker.token, {
      title: "Вопрос со скрытым ответом",
      rawMaterialId,
      questionTypeId,
    });
    const hiddenAnswerId = await answer(
      responder.token,
      hiddenQuestionId,
      "Этот ответ скрыт и не должен попасть в счётчики.",
    );
    await ctx.prisma.forumAnswer.update({ where: { id: hiddenAnswerId }, data: { hidden: true } });

    const summary = await ctx.http.get("/api/forum/summary").set(auth(responder.token));
    expect(summary.status).toBe(200);
    expect(summary.body.solvedQuestionsCount).toBe(2);
    expect(summary.body.currentUser).toMatchObject({ answersCount: 2, solvedAnswersCount: 2 });
    expect(summary.body.weeklyExperts).toHaveLength(1);
    expect(summary.body.weeklyExperts[0]).toMatchObject({
      solvedAnswersCount: 1,
      author: { userId: responder.userId },
    });
  });
});

describe("Forum: умный поиск", () => {
  it("ищет по смысловым формам, е/ё, опечаткам, фильтрам и ранжирует заголовок выше ответа", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900100");
    const responder = await registerCompany("0900101");

    const paperId = await createRawMaterial(adminToken, "Макулатура поиск");
    const plasticId = await createRawMaterial(adminToken, "ПЭТ поиск");
    const questionTypeId = await createQuestionType(adminToken, "Документы-поиск");

    const titleMatchId = await ask(asker.token, {
      title: "Лицензия на перевозку макулатуры",
      body: "Короткий вопрос про рейс.",
      rawMaterialId: paperId,
      questionTypeId,
    });
    const answerMatchId = await ask(asker.token, {
      title: "Как оформить рейс в соседний регион?",
      body: "Вопрос без точного ключевого слова.",
      rawMaterialId: paperId,
      questionTypeId,
    });
    await answer(responder.token, answerMatchId, "Для перевозки нужна лицензия и договор с перевозчиком.");
    const morphologyId = await ask(asker.token, {
      title: "Документы для перевозки вторсырья",
      body: "Проверяем русскую форму слова.",
      rawMaterialId: paperId,
      questionTypeId,
    });
    const yoId = await ask(asker.token, {
      title: "Сортёр для ПЭТ бутылки",
      body: "Название с буквой ё должно находиться через е.",
      rawMaterialId: plasticId,
      questionTypeId,
    });

    const ranked = await ctx.http.get("/api/forum").query({ q: "лицензия перевозка" }).set(auth(asker.token));
    expect(ranked.status).toBe(200);
    expect(ranked.body.items.map((item: { id: string }) => item.id)).toContain(answerMatchId);
    expect(ranked.body.items[0]).toMatchObject({
      id: titleMatchId,
      searchSnippet: { source: "title" },
    });
    expect(ranked.body.items[0].searchSnippet.highlights.length).toBeGreaterThan(0);

    const morphology = await ctx.http.get("/api/forum").query({ q: "вторсырье" }).set(auth(asker.token));
    expect(morphology.status).toBe(200);
    expect(morphology.body.items.map((item: { id: string }) => item.id)).toContain(morphologyId);

    const yo = await ctx.http.get("/api/forum").query({ q: "сортер" }).set(auth(asker.token));
    expect(yo.status).toBe(200);
    expect(yo.body.items.map((item: { id: string }) => item.id)).toContain(yoId);

    const typo = await ctx.http.get("/api/forum").query({ q: "лицензща" }).set(auth(asker.token));
    expect(typo.status).toBe(200);
    expect(typo.body.items.map((item: { id: string }) => item.id)).toContain(titleMatchId);

    const filtered = await ctx.http
      .get("/api/forum")
      .query({ q: "сортер", rawMaterialId: paperId })
      .set(auth(asker.token));
    expect(filtered.status).toBe(200);
    expect(filtered.body.items.map((item: { id: string }) => item.id)).not.toContain(yoId);
  });

  it("не ищет скрытые вопросы и скрытые ответы", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900102");
    const responder = await registerCompany("0900103");
    const rawMaterialId = await createRawMaterial(adminToken, "Скрытый поиск");
    const questionTypeId = await createQuestionType(adminToken, "Модерация-поиск");

    const visibleQuestionId = await ask(asker.token, {
      title: "Обычный вопрос без маркера",
      body: "Видимый текст не содержит секретный маркер.",
      rawMaterialId,
      questionTypeId,
    });
    const hiddenAnswerId = await answer(
      responder.token,
      visibleQuestionId,
      "sekretnyymarker найден только в скрытом ответе.",
    );
    await ctx.prisma.forumAnswer.update({ where: { id: hiddenAnswerId }, data: { hidden: true } });

    const hiddenQuestionId = await ask(asker.token, {
      title: "sekretnyymarker скрытого вопроса",
      body: "Этот вопрос скрыт модерацией.",
      rawMaterialId,
      questionTypeId,
    });
    await ctx.prisma.forumQuestion.update({ where: { id: hiddenQuestionId }, data: { status: "hidden" } });

    const search = await ctx.http.get("/api/forum").query({ q: "sekretnyymarker" }).set(auth(asker.token));
    expect(search.status).toBe(200);
    expect(search.body.items.map((item: { id: string }) => item.id)).not.toContain(visibleQuestionId);
    expect(search.body.items.map((item: { id: string }) => item.id)).not.toContain(hiddenQuestionId);
  });
});

describe("Forum: ветки обсуждения под ответами", () => {
  it("reply виден под ответом, но не влияет на статус, счётчики, голосование и выбор решения", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900060");
    const responder = await registerCompany("0900061");
    const commenter = await registerCompany("0900062");
    const rawMaterialId = await createRawMaterial(adminToken, "Плёнка ПВД");
    const questionTypeId = await createQuestionType(adminToken, "Документы-ветки");
    const questionId = await ask(asker.token, {
      title: "Нужна ли допсверка по документам?",
      rawMaterialId,
      questionTypeId,
    });
    const answerId = await answer(responder.token, questionId, "Основной ответ на вопрос.");

    const before = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(before.status).toBe(200);
    expect(before.body.status).toBe("answered");
    expect(before.body.answersCount).toBe(1);

    const replyId = await reply(commenter.token, answerId, "Уточнение к ответу без статуса основного ответа.");

    const after = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(after.status).toBe(200);
    expect(after.body.status).toBe("answered");
    expect(after.body.answersCount).toBe(1);
    expect(after.body.answers).toHaveLength(1);
    expect(after.body.answers[0].id).toBe(answerId);
    expect(after.body.answers[0].replies).toHaveLength(1);
    expect(after.body.answers[0].replies[0]).toMatchObject({
      id: replyId,
      body: "Уточнение к ответу без статуса основного ответа.",
    });

    const voteReply = await ctx.http.post(`/api/forum/answers/${replyId}/vote`).set(auth(asker.token));
    expect(voteReply.status).toBe(400);

    const acceptReply = await ctx.http
      .post(`/api/forum/q/${questionId}/accept`)
      .set(auth(asker.token))
      .send({ answerId: replyId });
    expect(acceptReply.status).toBe(400);
  });

  it("reply на reply прикрепляется к верхнему ответу, missing/hidden parent дают 404", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900063");
    const responder = await registerCompany("0900064");
    const commenter = await registerCompany("0900065");
    const rawMaterialId = await createRawMaterial(adminToken, "ПНД канистры");
    const questionTypeId = await createQuestionType(adminToken, "Практика-ветки");
    const questionId = await ask(asker.token, {
      title: "Как спорить с ошибочным ответом?",
      rawMaterialId,
      questionTypeId,
    });
    const answerId = await answer(responder.token, questionId, "Корневой ответ.");
    const firstReplyId = await reply(commenter.token, answerId, "Первое уточнение.");
    const secondReplyId = await reply(responder.token, firstReplyId, "Ответ на уточнение.");

    const secondReply = await ctx.prisma.forumAnswer.findUnique({
      where: { id: secondReplyId },
      select: { parentAnswerId: true },
    });
    expect(secondReply?.parentAnswerId).toBe(answerId);

    const detail = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(detail.status).toBe(200);
    expect(detail.body.answers[0].replies.map((item: { id: string }) => item.id)).toEqual([
      firstReplyId,
      secondReplyId,
    ]);

    const missing = await ctx.http
      .post("/api/forum/answers/missing-answer-id/replies")
      .set(auth(commenter.token))
      .send({ body: "Не должно создаться." });
    expect(missing.status).toBe(404);

    await ctx.prisma.forumAnswer.update({ where: { id: answerId }, data: { hidden: true } });
    const hidden = await ctx.http
      .post(`/api/forum/answers/${answerId}/replies`)
      .set(auth(commenter.token))
      .send({ body: "Не должно создаться." });
    expect(hidden.status).toBe(404);
  });

  it("скрытие верхнего ответа убирает ветку из выдачи, жалоба на reply создаёт кейс forum_answer", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900066");
    const responder = await registerCompany("0900067");
    const reporter = await registerCompany("0900068");
    const rawMaterialId = await createRawMaterial(adminToken, "Картон ветки");
    const questionTypeId = await createQuestionType(adminToken, "Модерация-ветки");
    const questionId = await ask(asker.token, {
      title: "Ветка должна скрываться вместе с ответом?",
      rawMaterialId,
      questionTypeId,
    });
    const answerId = await answer(responder.token, questionId, "Ответ с обсуждением.");
    const replyId = await reply(reporter.token, answerId, "Спорная реплика.");

    const complaint = await ctx.http
      .post("/api/moderation/complaints")
      .set(auth(asker.token))
      .send({ entityType: "forum_answer", entityId: replyId, reasonCode: "false_information" });
    expect(complaint.status).toBe(201);

    const moderationCase = await ctx.prisma.moderationCase.findFirst({
      where: { entityType: "forum_answer", entityId: replyId },
    });
    expect(moderationCase).not.toBeNull();

    await ctx.prisma.$transaction(async (tx) => {
      await tx.forumAnswer.update({ where: { id: answerId }, data: { hidden: true } });
      await tx.forumQuestion.update({ where: { id: questionId }, data: { answersCount: 0, status: "open" } });
    });

    const detail = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(asker.token));
    expect(detail.status).toBe(200);
    expect(detail.body.answers).toHaveLength(0);
    expect(detail.body.answersCount).toBe(0);
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

describe("Forum: просмотры", () => {
  it("лента и чтение деталей не накручивают просмотры, просмотр фиксируется отдельным действием", async () => {
    const adminToken = await loginAdmin();
    const asker = await registerCompany("0900025");
    const reader = await registerCompany("0900026");
    const rawMaterialId = await createRawMaterial(adminToken, "ПП биг-бэг");
    const questionTypeId = await createQuestionType(adminToken, "Практика");
    const questionId = await ask(asker.token, {
      title: "Как подготовить биг-бэг к отгрузке?",
      rawMaterialId,
      questionTypeId,
    });

    const list = await ctx.http.get("/api/forum").set(auth(reader.token));
    expect(list.status).toBe(200);
    expect(list.body.items.find((item: { id: string }) => item.id === questionId)?.views).toBe(0);
    await expectQuestionViews(questionId, 0);

    const detail = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(reader.token));
    expect(detail.status).toBe(200);
    expect(detail.body.views).toBe(0);
    await expectQuestionViews(questionId, 0);

    const view = await ctx.http.post(`/api/forum/q/${questionId}/view`).set(auth(reader.token));
    expect(view.status).toBe(201);
    expect(view.body.views).toBe(1);

    const afterView = await ctx.http.get(`/api/forum/q/${questionId}`).set(auth(reader.token));
    expect(afterView.status).toBe(200);
    expect(afterView.body.views).toBe(1);
    await expectQuestionViews(questionId, 1);
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

async function expectQuestionViews(questionId: string, views: number) {
  const question = await ctx.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { views: true },
  });
  expect(question?.views).toBe(views);
}

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

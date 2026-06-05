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

    expect(await ctx.prisma.moderationCase.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(
      1,
    );
    expect(await ctx.prisma.complaint.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(2);
  });

  it("не позволяет пользователю пожаловаться на свой комментарий", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0000057");
    const { comment } = await createPublishedNewsWithComment(adminToken, author.token);

    const ownComplaint = await ctx.http
      .post("/api/moderation/complaints")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ entityType: "news_comment", entityId: comment.id, reasonCode: "spam" });

    expect(ownComplaint.status).toBe(403);
    expect(await ctx.prisma.complaint.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(0);
    expect(await ctx.prisma.moderationCase.count({ where: { entityType: "news_comment", entityId: comment.id } })).toBe(
      0,
    );
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

    const forbidden = await ctx.http
      .get("/api/admin/moderation/cases")
      .set("Authorization", `Bearer ${reporter.token}`);
    expect(forbidden.status).toBe(403);

    const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const caseId = list.body.items[0].id as string;

    const lock = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/lock`)
      .set("Authorization", `Bearer ${moderatorToken}`);
    expect(lock.status).toBe(201);
    expect(lock.body.status).toBe("in_review");
    expect(lock.body.lockedBy.email).toBe("moderator@test.local");

    const release = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/release`)
      .set("Authorization", `Bearer ${moderatorToken}`);
    expect(release.status).toBe(201);
    expect(release.body.status).toBe("open");
    expect(release.body.lockedById).toBeNull();
  });

  it("валидирует query списка кейсов модерации", async () => {
    const moderatorToken = await loginModerator();

    const res = await ctx.http
      .get("/api/admin/moderation/cases?limit=abc")
      .set("Authorization", `Bearer ${moderatorToken}`);

    expect(res.status).toBe(400);
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
    const caseId = list.body.items[0].id as string;
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
    const caseId = list.body.items[0].id as string;
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
    const caseId = list.body.items[0].id as string;
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
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].entity).toMatchObject({ type: "news_post", title: news.title, slug: news.slug });
    const caseId = list.body.items[0].id as string;

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
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].entity).toMatchObject({
      type: "knowledge_article",
      title: article.title,
      slug: article.slug,
    });
    const caseId = list.body.items[0].id as string;

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
    const caseId = list.body.items[0].id as string;
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/decisions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "warn_company", reasonCode: "valid_complaint" });
    expect(decision.status).toBe(400);
  });
});

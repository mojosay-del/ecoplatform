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
    const caseId = list.body.items[0].id as string;
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
      .send({ email: `user0000060@test.local`, password: "User12345678" });
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

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: caseId, action: "moderation.admin_sanction.module_restriction" },
    });
    const payload = log?.payload as {
      before: { restriction: null };
      after: { restriction: { moduleCode: string; expiresAt: string } };
      diff: Record<string, { before: unknown; after: unknown }>;
      sanctionId: string;
      moduleCode: string;
      durationDays: number;
    };
    expect(payload.before.restriction).toBeNull();
    expect(payload.after.restriction.moduleCode).toBe("comments");
    expect(payload.diff.restriction.before).toBeNull();
    expect(payload.diff.restriction.after).toMatchObject({ moduleCode: "comments" });
    expect(payload.sanctionId).toBe(restriction!.sanctionId);
    expect(payload.moduleCode).toBe("comments");
    expect(payload.durationDays).toBe(7);

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
    const caseId = list.body.items[0].id as string;

    const res = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "user_block", reasonCode: "severe_violation" });
    expect(res.status).toBe(400);
  });

  it("нельзя заблокировать PLATFORM_OWNER_EMAIL через admin-санкцию", async () => {
    await withEnv({ PLATFORM_OWNER_EMAIL: "admin@test.local" }, async () => {
      const adminToken = await loginAdmin();
      const moderatorToken = await loginModerator();
      const secondAdmin = await registerCompany("0000074");
      const reporter = await registerCompany("0000075");

      const grant = await ctx.http
        .patch(`/api/admin/users/${secondAdmin.userId}/platform-roles`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ roles: ["admin"], isActive: true });
      expect(grant.status).toBe(200);

      const news = await createPublishedNews(adminToken, "owner-block");
      await ctx.http
        .post("/api/moderation/complaints")
        .set("Authorization", `Bearer ${reporter.token}`)
        .send({ entityType: "news_post", entityId: news.id, reasonCode: "illegal_content" });

      const list = await ctx.http.get("/api/admin/moderation/cases").set("Authorization", `Bearer ${moderatorToken}`);
      const caseId = list.body.items[0].id as string;
      await ctx.http
        .post(`/api/admin/moderation/cases/${caseId}/lock`)
        .set("Authorization", `Bearer ${moderatorToken}`);
      await ctx.http
        .post(`/api/admin/moderation/cases/${caseId}/decisions`)
        .set("Authorization", `Bearer ${moderatorToken}`)
        .send({ type: "escalate_to_admin", reasonCode: "severe_violation" });

      const block = await ctx.http
        .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
        .set("Authorization", `Bearer ${secondAdmin.token}`)
        .send({ type: "user_block", reasonCode: "severe_violation" });
      expect(block.status).toBe(400);

      const owner = await ctx.prisma.user.findUniqueOrThrow({ where: { email: "admin@test.local" } });
      expect(owner.status).toBe(UserStatus.active);
    });
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
      .send({ email: "user0000070@test.local", password: "User12345678" });
    expect(relogin.status).toBe(201);
  });

  it("lift company_block возвращает прежний статус компании", async () => {
    const adminToken = await loginAdmin();
    const moderatorToken = await loginModerator();
    const { caseId, author } = await escalatedCaseAgainstAuthor(adminToken, moderatorToken, "0000076", "0000077");

    const before = await ctx.prisma.company.findUniqueOrThrow({ where: { id: author.companyId } });
    expect(before.status).toBe(CompanyStatus.demo);

    const applied = await ctx.http
      .post(`/api/admin/moderation/cases/${caseId}/admin-sanctions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "company_block", reasonCode: "severe_violation" });
    expect(applied.status).toBe(201);

    const sanction = await ctx.prisma.sanction.findFirstOrThrow({
      where: { caseId, type: SanctionType.company_block },
    });

    const lift = await ctx.http
      .post(`/api/admin/moderation/sanctions/${sanction.id}/lift`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reasonCode: "unfounded_complaint" });
    expect(lift.status).toBe(201);

    const restored = await ctx.prisma.company.findUniqueOrThrow({ where: { id: author.companyId } });
    expect(restored.status).toBe(CompanyStatus.demo);
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

import { afterAll, beforeAll, beforeEach, expect } from "vitest";
import { hash } from "bcryptjs";
import { CompanyRole, FileAccessLevel, LegalDocumentType, PlatformRole } from "@prisma/client";
import { createTestApp, resetDb, type TestApp } from "./test-app";
import type { PrismaService } from "../prisma/prisma.service";
import { REQUIRED_DOC_IDS_FOR_TESTS, TEST_EMAIL_VERIFICATION_CODE } from "./integration-helpers";

// Сид общего состояния перед каждым тестом: админ (нужен почти везде для ручной
// активации/CMS) + обязательные активные юр-документы + согласия админа на них
// (иначе auth/me.requiresReConsent=true и кабинет блокируется). Повторяет
// прод-поведение проверки согласий.
async function seedBaseline(prisma: PrismaService) {
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@test.local",
      firstName: "Админ",
      lastName: "Тестов",
      phone: "+70000000001",
      passwordHash: await hash("Admin12345", 4),
      platformStaff: { create: { roles: [PlatformRole.admin], isActive: true } },
    },
  });

  await prisma.legalDocument.createMany({
    data: [
      {
        id: "test-doc-privacy",
        type: LegalDocumentType.privacy_policy,
        version: "1.0.0",
        title: "Политика конфиденциальности",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
      {
        id: "test-doc-terms",
        type: LegalDocumentType.terms_of_service,
        version: "1.0.0",
        title: "Пользовательское соглашение",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
      {
        id: "test-doc-pd",
        type: LegalDocumentType.personal_data_consent,
        version: "1.0.0",
        title: "Согласие на обработку ПДн",
        body: "<p>тест</p>",
        isRequired: true,
        isActive: true,
        publishedAt: new Date(),
      },
    ],
  });

  await prisma.consentRecord.createMany({
    data: ["test-doc-privacy", "test-doc-terms", "test-doc-pd"].map((documentId) => ({
      userId: adminUser.id,
      documentId,
      source: "admin_action" as const,
    })),
  });
}

// Поднимает Nest-приложение один раз на test-файл, чистит и сидит БД перед
// каждым тестом и отдаёт набор общих хелперов. Заменяет общий модульный ctx из
// бывшего app.integration.test.ts при декомпозиции по доменам. http/prisma/app
// отдаются геттерами (значение появляется только после beforeAll), а хелперы
// можно деструктурировать в файле сразу.
export function setupIntegrationContext() {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb(testApp.prisma);
    await seedBaseline(testApp.prisma);
  });

  async function loginAdmin(): Promise<string> {
    const res = await testApp.http.post("/api/auth/login").send({ email: "admin@test.local", password: "Admin12345" });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  }

  async function loginModerator(): Promise<string> {
    await testApp.prisma.user.create({
      data: {
        email: "moderator@test.local",
        firstName: "Модератор",
        lastName: "Тестов",
        phone: "+70000000002",
        passwordHash: await hash("Moderator12345", 4),
        platformStaff: { create: { roles: [PlatformRole.moderator], isActive: true } },
      },
    });

    const res = await testApp.http
      .post("/api/auth/login")
      .send({ email: "moderator@test.local", password: "Moderator12345" });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  }

  async function loginContentManager(): Promise<string> {
    await testApp.prisma.user.create({
      data: {
        email: "content-manager@test.local",
        firstName: "Контент",
        lastName: "Менеджер",
        phone: "+70000000003",
        passwordHash: await hash("Content12345", 4),
        platformStaff: { create: { roles: [PlatformRole.content_manager], isActive: true } },
      },
    });

    const res = await testApp.http
      .post("/api/auth/login")
      .send({ email: "content-manager@test.local", password: "Content12345" });
    expect(res.status).toBe(201);
    return res.body.accessToken as string;
  }

  async function submitRegistration(body: Record<string, unknown>) {
    const res = await testApp.http.post("/api/auth/register").send({
      ...body,
      acceptedDocumentIds: body.acceptedDocumentIds ?? REQUIRED_DOC_IDS_FOR_TESTS,
    });
    expect(res.status).toBe(201);
    expect(res.body.verificationId).toEqual(expect.any(String));
    expect(res.body.expiresAt).toEqual(expect.any(String));
    return res.body as { verificationId: string; email: string; expiresAt: string };
  }

  async function verifyRegistration(verificationId: string): Promise<string> {
    const res = await testApp.http
      .post("/api/auth/register/verify")
      .send({ verificationId, code: TEST_EMAIL_VERIFICATION_CODE });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toMatch(/\./);
    return res.body.accessToken as string;
  }

  async function registerWithBody(body: Record<string, unknown>): Promise<string> {
    const start = await submitRegistration(body);
    return verifyRegistration(start.verificationId);
  }

  async function registerCompany(suffix: string): Promise<{ token: string; companyId: string; userId: string }> {
    const token = await registerWithBody({
      organizationName: `ООО Тест ${suffix}`,
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: `+7900${suffix}`,
      email: `user${suffix}@test.local`,
      password: "User12345678",
    });

    const me = await testApp.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.avatarUrl).toBeNull();
    expect(me.body.companyId).toBe(me.body.company.id);
    expect(me.body.company.organizationName).toBe(`ООО Тест ${suffix}`);
    expect(me.body.company.billingInn).toBeUndefined();
    const company = await testApp.prisma.company.findUniqueOrThrow({ where: { id: me.body.company.id } });
    expect(company.billingInn).toBeNull();
    expect(me.body.requiresReConsent).toBe(false);
    return { token, companyId: me.body.company.id, userId: me.body.id };
  }

  async function createCompanyMember(companyId: string, suffix: string): Promise<{ token: string; userId: string }> {
    const password = "Member12345678";
    const member = await testApp.prisma.user.create({
      data: {
        email: `member${suffix}@test.local`,
        firstName: "Пётр",
        lastName: "Сотрудников",
        phone: `+7910${suffix}`,
        passwordHash: await hash(password, 4),
        companyId,
        companyRole: CompanyRole.member,
      },
    });

    const login = await testApp.http.post("/api/auth/login").send({ email: member.email, password });
    expect(login.status).toBe(201);
    return { token: login.body.accessToken as string, userId: member.id };
  }

  async function createPublishedNewsWithComment(adminToken: string, authorToken: string) {
    const draft = await testApp.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Новость для модерации",
        lead: "Лид новости",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
        tags: ["moderation"],
      });
    expect(draft.status).toBe(201);

    const publish = await testApp.http
      .post(`/api/admin/content/news/${draft.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const comment = await testApp.http
      .post(`/api/news/${draft.body.id}/comments`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ text: "Комментарий для проверки модерации" });
    expect(comment.status).toBe(201);

    return { news: publish.body, comment: comment.body };
  }

  async function createPublishedNews(adminToken: string, suffix: string, tags: string[] = [`moderation-${suffix}`]) {
    const draft = await testApp.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Новость для модерации ${suffix}`,
        lead: "Лид новости",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
        tags,
      });
    expect(draft.status).toBe(201);

    const publish = await testApp.http
      .post(`/api/admin/content/news/${draft.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    return publish.body as { id: string; slug: string; title: string };
  }

  async function createCoverAsset(uploadedById: string, suffix: string) {
    return testApp.prisma.fileAsset.create({
      data: {
        originalName: `${suffix}.webp`,
        mimeType: "image/webp",
        sizeBytes: 1200,
        storageKey: `test/${suffix}.webp`,
        accessLevel: FileAccessLevel.public,
        uploadedById,
      },
    });
  }

  async function createPublishedKnowledgeArticle(adminToken: string, suffix: string) {
    const draft = await testApp.http
      .post("/api/admin/content/knowledge-base")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Статья ${suffix}`,
        position: 0,
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело статьи.</p>" } }],
      });
    expect(draft.status).toBe(201);

    const publish = await testApp.http
      .post(`/api/admin/content/knowledge-base/${draft.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    return publish.body as { id: string; slug: string; title: string };
  }

  return {
    get app() {
      return testApp.app;
    },
    get prisma() {
      return testApp.prisma;
    },
    get http() {
      return testApp.http;
    },
    get rawHttp() {
      return testApp.rawHttp;
    },
    loginAdmin,
    loginModerator,
    loginContentManager,
    submitRegistration,
    verifyRegistration,
    registerWithBody,
    registerCompany,
    createCompanyMember,
    createPublishedNewsWithComment,
    createPublishedNews,
    createCoverAsset,
    createPublishedKnowledgeArticle,
  };
}

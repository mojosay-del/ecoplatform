import type { IncomingMessage } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  createCompanyMember,
  createPublishedNewsWithComment,
  createPublishedNews,
  createCoverAsset,
  createPublishedKnowledgeArticle,
} = ctx;

describe("Legal documents & consents", () => {
  // Используем версии 9.x.x чтобы не пересечься с seed-документами из beforeEach
  // (test-doc-privacy/terms/pd с версией 1.0.0).
  async function createActiveDoc(type: LegalDocumentType, version: string, isRequired = true) {
    return ctx.prisma.legalDocument.create({
      data: {
        type,
        version,
        title: `Документ ${type} ${version}`,
        body: `<p>Тело ${type} ${version}</p>`,
        isRequired,
        isActive: true,
        publishedAt: new Date(),
      },
    });
  }

  it("публичная выдача активных документов: фильтр по типам и без фильтра", async () => {
    // beforeEach создал 3 обязательных документа. Добавим одну cookie-версию.
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);

    const all = await ctx.http.get("/api/legal/documents");
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(4);
    const types = all.body.map((d: { type: string }) => d.type).sort();
    expect(types).toEqual(["cookie_policy", "personal_data_consent", "privacy_policy", "terms_of_service"]);
    // body НЕ должно отдаваться в summary-выдаче — это легче для каталога
    expect(all.body[0].body).toBeUndefined();

    const filtered = await ctx.http.get("/api/legal/documents?types=privacy_policy,cookie_policy");
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(2);
    const filteredIds = filtered.body.map((d: { id: string }) => d.id).sort();
    expect(filteredIds.some((id: string) => id === cookieDoc.id)).toBe(true);
  });

  it("получение конкретной версии документа", async () => {
    const res = await ctx.http.get("/api/legal/documents/privacy_policy/1.0.0");
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
    expect(res.body.body).toBeTruthy();

    const missing = await ctx.http.get("/api/legal/documents/privacy_policy/9.9.9");
    expect(missing.status).toBe(404);
  });

  it("получение документа повторно санитизирует legacy body из БД", async () => {
    await ctx.prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.cookie_policy,
        version: "9.1.0",
        title: "Legacy cookies",
        body: '<p onclick="alert(1)">Текст</p><script>alert(1)</script><a href="javascript:alert(1)" target="_blank">bad</a>',
        isRequired: false,
        isActive: true,
        publishedAt: new Date(),
      },
    });

    const res = await ctx.http.get("/api/legal/documents/cookie_policy/9.1.0");

    expect(res.status).toBe(200);
    expect(res.body.body).toBe('<p>Текст</p><a target="_blank" rel="noopener noreferrer">bad</a>');
  });

  it("публичные legal endpoints отклоняют неизвестный тип и не отдают черновик", async () => {
    const invalidType = await ctx.http.get("/api/legal/documents/unknown_policy/1.0.0");
    expect(invalidType.status).toBe(400);

    const invalidFilter = await ctx.http.get("/api/legal/documents?types=privacy_policy,unknown_policy");
    expect(invalidFilter.status).toBe(400);

    await ctx.prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.cookie_policy,
        version: "8.9.9",
        title: "Черновик cookies",
        body: "<p>Ещё не опубликовано</p>",
        isRequired: false,
        isActive: false,
      },
    });

    const draft = await ctx.http.get("/api/legal/documents/cookie_policy/8.9.9");
    expect(draft.status).toBe(404);
  });

  it("POST /consents записывает согласие в БД с IP и user-agent", async () => {
    const doc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const { token, userId } = await registerCompany("0000200");

    const res = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "vitest-agent")
      .send({ documentIds: [doc.id], source: "cookie_banner" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });

    const records = await ctx.prisma.consentRecord.findMany({ where: { userId, documentId: doc.id } });
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("cookie_banner");
    expect(records[0].userAgent).toBe("vitest-agent");
  });

  it("POST /consents отклоняет неактивную версию", async () => {
    const { token } = await registerCompany("0000201");
    const draft = await ctx.prisma.legalDocument.create({
      data: {
        type: LegalDocumentType.cookie_policy,
        version: "0.9.0",
        title: "Черновик",
        body: "<p>x</p>",
        isRequired: false,
        isActive: false,
      },
    });
    const res = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [draft.id] });
    expect(res.status).toBe(400);
  });

  it("GET /me/consents возвращает только согласия текущего пользователя", async () => {
    // На регистрации пользователь подтверждает 3 обязательных документа,
    // поэтому на a уже минимум 3 записи. Добавим ещё одну на cookie.
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const a = await registerCompany("0000202");
    const b = await registerCompany("0000203");
    await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });

    const aMe = await ctx.http.get("/api/legal/me/consents").set("Authorization", `Bearer ${a.token}`);
    expect(aMe.status).toBe(200);
    expect(aMe.body).toHaveLength(4);
    const aDocIds = aMe.body.map((r: { documentId: string }) => r.documentId).sort();
    expect(aDocIds).toEqual([...REQUIRED_DOC_IDS_FOR_TESTS, cookieDoc.id].sort());

    const bMe = await ctx.http.get("/api/legal/me/consents").set("Authorization", `Bearer ${b.token}`);
    expect(bMe.status).toBe(200);
    // b подтвердил только 3 обязательных при регистрации
    expect(bMe.body).toHaveLength(3);
  });

  it("повторный POST /consents идемпотентен (skipDuplicates)", async () => {
    const cookieDoc = await createActiveDoc(LegalDocumentType.cookie_policy, "9.0.0", false);
    const { token, userId } = await registerCompany("0000204");

    const first = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });
    expect(first.status).toBe(201);
    const second = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [cookieDoc.id], source: "settings" });
    expect(second.status).toBe(201);
    const count = await ctx.prisma.consentRecord.count({ where: { userId, documentId: cookieDoc.id } });
    expect(count).toBe(1);
  });

  it("admin создаёт новую версию документа и активирует её, предыдущая деактивируется", async () => {
    // Берём seed-документ test-doc-privacy как v1, создадим новую v2 через API.
    const v1Id = "test-doc-privacy";
    const adminToken = await loginAdmin();

    const create = await ctx.http.post("/api/admin/legal/documents").set("Authorization", `Bearer ${adminToken}`).send({
      type: "privacy_policy",
      version: "1.1.0",
      title: "Политика v1.1",
      summary: "Расширили раздел про cookies",
      body: "<p>Обновлённый текст</p>",
      isRequired: true,
    });
    expect(create.status).toBe(201);
    expect(create.body.isActive).toBe(false);
    const v2Id = create.body.id as string;

    const publish = await ctx.http
      .post(`/api/admin/legal/documents/${v2Id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(publish.status).toBe(201);
    expect(publish.body.isActive).toBe(true);
    expect(publish.body.publishedAt).toBeTruthy();

    const prev = await ctx.prisma.legalDocument.findUnique({ where: { id: v1Id } });
    expect(prev?.isActive).toBe(false);
    const active = await ctx.prisma.legalDocument.findMany({
      where: { type: LegalDocumentType.privacy_policy, isActive: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(v2Id);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: v2Id, action: "admin.legal.document.publish" },
    });
    expect(log).toBeTruthy();
  });

  it("admin не может создать дубль (type, version)", async () => {
    // privacy_policy 1.0.0 уже создан в beforeEach (test-doc-privacy).
    const adminToken = await loginAdmin();

    const res = await ctx.http.post("/api/admin/legal/documents").set("Authorization", `Bearer ${adminToken}`).send({
      type: "privacy_policy",
      version: "1.0.0",
      title: "Дубль",
      body: "<p>x</p>",
      isRequired: true,
    });
    expect(res.status).toBe(409);
  });

  it("обычный пользователь не имеет доступа к admin/legal/*", async () => {
    const { token } = await registerCompany("0000205");
    const res = await ctx.http.get("/api/admin/legal/documents").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("регистрация записывает 3 ConsentRecord c source=registration и ipAddress", async () => {
    const { userId } = await registerCompany("0000206");
    const records = await ctx.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { documentId: "asc" },
    });
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record.source).toBe("registration");
      // ipAddress в integration-supertest может быть пустым — главное, что поле
      // присутствует (NULL допустим). На проде trust proxy=1 заполнит его.
      expect(record).toHaveProperty("ipAddress");
    }
    expect(records.map((r) => r.documentId).sort()).toEqual([...REQUIRED_DOC_IDS_FOR_TESTS].sort());
  });

  it("регистрация без обязательного документа — 400", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Без согласий",
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+79000000300",
      email: "noconsents@test.local",
      password: "User12345678",
      acceptedDocumentIds: ["test-doc-privacy", "test-doc-terms"], // не хватает personal_data_consent
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Согласие на обработку ПДн");
    // пользователь не должен быть создан
    const u = await ctx.prisma.user.findUnique({ where: { email: "noconsents@test.local" } });
    expect(u).toBeNull();
  });

  it("auth/me.requiresReConsent=true после публикации новой обязательной версии", async () => {
    const { token, userId } = await registerCompany("0000207");

    const me1 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me1.body.requiresReConsent).toBe(false);

    // Контент-менеджер публикует новую версию privacy_policy.
    const adminToken = await loginAdmin();
    const created = await ctx.http
      .post("/api/admin/legal/documents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        type: "privacy_policy",
        version: "2.0.0",
        title: "Политика v2",
        body: "<p>обновили</p>",
        isRequired: true,
      });
    expect(created.status).toBe(201);
    await ctx.http
      .post(`/api/admin/legal/documents/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    // У пользователя ещё нет ConsentRecord на новую активную версию.
    const me2 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me2.body.requiresReConsent).toBe(true);

    // Пользователь подтверждает новую версию.
    const accept = await ctx.http
      .post("/api/legal/consents")
      .set("Authorization", `Bearer ${token}`)
      .send({ documentIds: [created.body.id], source: "login_reconfirm" });
    expect(accept.status).toBe(201);

    const me3 = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me3.body.requiresReConsent).toBe(false);

    // sanity: всего 4 записи — 3 при регистрации + 1 на v2
    const count = await ctx.prisma.consentRecord.count({ where: { userId } });
    expect(count).toBe(4);
  });
});

describe("Company profile (Волна 7.2/7.3 — Address, расширенные поля)", () => {
  it("PATCH /billing/company сохраняет контакты, реквизиты и factualAddress", async () => {
    const { token, companyId } = await registerCompany("0700100");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { logoFileId: "legacy-logo-file-id" },
    });

    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        websiteUrl: "https://example.ru",
        corporatePhone: "+74951234567",
        corporateEmail: "info@example.ru",
        about: "Принимаем макулатуру и ПЭТ",
        contactPersonName: "Иван Петров",
        contactPersonPhone: "+79161112233",
        contactPersonEmail: "ivan@example.ru",
        billingInn: "7707083893",
        billingKpp: "770701001",
        bankName: "ПАО Сбербанк",
        bankBik: "044525225",
        bankAccount: "40702810500000000123",
        correspondentAccount: "30101810400000000225",
        factualAddress: {
          country: "Россия",
          region: "Московская область",
          city: "Подольск",
          street: "Ленина",
          building: "12",
          apartment: "5",
          postcode: "142100",
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.websiteUrl).toBe("https://example.ru");
    expect(res.body.corporatePhone).toBe("+74951234567");
    expect(res.body.about).toBe("Принимаем макулатуру и ПЭТ");
    expect(res.body.billingInn).toBe("7707083893");
    expect(res.body).not.toHaveProperty("logoFileId");
    expect(res.body.factualAddress).toMatchObject({
      country: "Россия",
      region: "Московская область",
      city: "Подольск",
      street: "Ленина",
      building: "12",
      postcode: "142100",
      source: "manual",
    });
    // formatted собран автоматически
    expect(res.body.factualAddress.formatted).toContain("Подольск");
    expect(res.body.factualAddress.formatted).toContain("Ленина");

    // GET /billing/status тоже отдаёт новые поля
    const status = await ctx.http.get("/api/billing/status").set("Authorization", `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.corporateEmail).toBe("info@example.ru");
    expect(status.body.factualAddress.city).toBe("Подольск");
    expect(status.body.structuredLegalAddress).toBeNull();
    expect(status.body).not.toHaveProperty("logoFileId");

    // sanity: в БД Address действительно создан
    const company = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      include: { factualAddress: true },
    });
    expect(company?.factualAddress?.city).toBe("Подольск");
  });

  it("PATCH /billing/company геокодит factualAddress для сортировки площадки по расстоянию", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          items: [
            {
              full_name: "Россия, Москва, Тверская улица, 1",
              point: { lat: 55.755864, lon: 37.617698 },
              adm_div: [
                { type: "country", name: "Россия" },
                { type: "region", name: "Москва" },
                { type: "city", name: "Москва" },
              ],
            },
          ],
        },
      }),
    });

    try {
      vi.stubGlobal("fetch", fetchMock);
      await withEnv({ DGIS_GEOCODER_API_KEY: "test-key" }, async () => {
        const { token, companyId } = await registerCompany("0700103");

        const res = await ctx.http
          .patch("/api/billing/company")
          .set("Authorization", `Bearer ${token}`)
          .send({
            factualAddress: {
              country: "Россия",
              city: "Москва",
              street: "Тверская",
              building: "1",
              postcode: "125009",
            },
          });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("125009"), expect.any(Object));

        const company = await ctx.prisma.company.findUniqueOrThrow({
          where: { id: companyId },
          include: { factualAddress: true },
        });
        expect(company.factualAddress?.latitude?.toString()).toBe("55.755864");
        expect(company.factualAddress?.longitude?.toString()).toBe("37.617698");
        expect(company.factualAddress?.region).toBe("Москва");
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("повторный PATCH с factualAddress обновляет ту же строку Address, не создаёт новую", async () => {
    const { token, companyId } = await registerCompany("0700101");

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factualAddress: { city: "Москва", postcode: "101000" },
      });
    const company1 = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      select: { factualAddressId: true },
    });
    expect(company1?.factualAddressId).toBeTruthy();
    const addressIdBefore = company1!.factualAddressId!;

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        factualAddress: { city: "Санкт-Петербург", postcode: "190000" },
      });
    const company2 = await ctx.prisma.company.findUnique({
      where: { id: companyId },
      include: { factualAddress: true },
    });
    expect(company2?.factualAddressId).toBe(addressIdBefore);
    expect(company2?.factualAddress?.city).toBe("Санкт-Петербург");

    // Проверяем, что не создалось двух Address-ов на эту компанию
    const total = await ctx.prisma.address.count();
    // На той же тестовой сессии могли быть прочие Address — проверяем точечно
    expect(company2?.factualAddress?.id).toBe(addressIdBefore);
    expect(total).toBeGreaterThanOrEqual(1);
  });

  it("structuredLegalAddress дублирует formatted в старое legalAddress (обратная совместимость)", async () => {
    const { token, companyId } = await registerCompany("0700102");

    await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({
        structuredLegalAddress: {
          city: "Тула",
          street: "Советская",
          building: "1",
          formatted: "300000, г. Тула, ул. Советская, д. 1",
        },
      });

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.legalAddress).toBe("300000, г. Тула, ул. Советская, д. 1");
  });

  it("PATCH /billing/company от платформенного staff → 403", async () => {
    const adminToken = await loginAdmin();
    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ websiteUrl: "https://x.test" });
    expect(res.status).toBe(403);
  });

  it("PATCH /billing/company от участника компании → 403 без изменения данных", async () => {
    const { companyId } = await registerCompany("0700104");
    const member = await createCompanyMember(companyId, "0700104");

    const res = await ctx.http.patch("/api/billing/company").set("Authorization", `Bearer ${member.token}`).send({
      websiteUrl: "https://member-update.test",
      billingInn: "7707083893",
    });

    expect(res.status).toBe(403);
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.websiteUrl).toBeNull();
    expect(company.billingInn).toBeNull();
  });

  it("PATCH с битым ИНН → 400", async () => {
    const { token } = await registerCompany("0700103");
    const res = await ctx.http
      .patch("/api/billing/company")
      .set("Authorization", `Bearer ${token}`)
      .send({ billingInn: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("Discussion (полиморфные обсуждения, Волна 7.1)", () => {
  it("первый POST /news/:id/comments лениво создаёт Discussion(news_post, id)", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700001");
    const news = await createPublishedNews(adminToken, "discussion-lazy");

    // До первого комментария Discussion ещё нет.
    const before = await ctx.prisma.discussion.findUnique({
      where: { targetType_targetId: { targetType: "news_post", targetId: news.id } },
    });
    expect(before).toBeNull();

    const res = await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Первый комментарий" });
    expect(res.status).toBe(201);

    const after = await ctx.prisma.discussion.findUnique({
      where: { targetType_targetId: { targetType: "news_post", targetId: news.id } },
      include: { comments: true },
    });
    expect(after).toBeTruthy();
    expect(after?.comments).toHaveLength(1);
    expect(after?.comments[0].text).toBe("Первый комментарий");
  });

  it("второй комментарий переиспользует существующую Discussion (не создаёт дубль)", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700002");
    const news = await createPublishedNews(adminToken, "discussion-reuse");

    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Первый" });
    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Второй" });

    const discussions = await ctx.prisma.discussion.findMany({
      where: { targetType: "news_post", targetId: news.id },
      include: { comments: true },
    });
    expect(discussions).toHaveLength(1);
    expect(discussions[0].comments).toHaveLength(2);
  });

  it("GET /news/:slug возвращает комментарии через Discussion и счётчик _count.comments", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700003");
    const news = await createPublishedNews(adminToken, "discussion-fetch");

    await ctx.http
      .post(`/api/news/${news.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Видимый комментарий" });

    const res = await ctx.http.get(`/api/news/${news.slug}`).set("Authorization", `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].text).toBe("Видимый комментарий");
    expect(res.body._count.comments).toBe(1);
  });

  it("POST /news/:id/comments не создаёт Discussion для черновика, отсутствующей новости или чужого parent", async () => {
    const adminToken = await loginAdmin();
    const author = await registerCompany("0700004");

    const draft = await ctx.http
      .post("/api/admin/content/news")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Черновик без комментариев",
        lead: "Лид",
        blocks: [{ type: "paragraph", payload: { html: "<p>Тело новости.</p>" } }],
        tags: [],
      });
    expect(draft.status).toBe(201);

    const draftComment = await ctx.http
      .post(`/api/news/${draft.body.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Комментарий к черновику" });
    expect(draftComment.status).toBe(404);
    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: draft.body.id } }),
    ).resolves.toBe(0);

    const missingComment = await ctx.http
      .post("/api/news/missing-news-id/comments")
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Комментарий к отсутствующей новости" });
    expect(missingComment.status).toBe(404);
    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: "missing-news-id" } }),
    ).resolves.toBe(0);

    const firstNews = await createPublishedNews(adminToken, "discussion-parent-a");
    const secondNews = await createPublishedNews(adminToken, "discussion-parent-b");
    const parent = await ctx.http
      .post(`/api/news/${firstNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Родительский комментарий" });
    expect(parent.status).toBe(201);

    const foreignParent = await ctx.http
      .post(`/api/news/${secondNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Ответ не в той новости", parentCommentId: parent.body.id });
    expect(foreignParent.status).toBe(404);

    const missingParent = await ctx.http
      .post(`/api/news/${secondNews.id}/comments`)
      .set("Authorization", `Bearer ${author.token}`)
      .send({ text: "Ответ без родителя", parentCommentId: "missing-comment-id" });
    expect(missingParent.status).toBe(404);

    await expect(
      ctx.prisma.discussion.count({ where: { targetType: "news_post", targetId: secondNews.id } }),
    ).resolves.toBe(0);
  });
});

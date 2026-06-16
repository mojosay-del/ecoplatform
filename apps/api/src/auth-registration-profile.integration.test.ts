import { CompanyStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { REQUIRED_DOC_IDS_FOR_TESTS } from "./test/integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, submitRegistration, verifyRegistration, registerWithBody, registerCompany } = ctx;

describe("Auth — регистрация и профиль", () => {
  it("регистрация после подтверждения почты создаёт компанию в demo-статусе и возвращает access-токен", async () => {
    const { token, companyId } = await registerCompany("0000001");
    expect(token).toMatch(/\./);

    const company = await ctx.prisma.company.findUnique({ where: { id: companyId } });
    expect(company?.status).toBe(CompanyStatus.demo);
    expect(company?.type).toBe("collector");
    expect(company?.demoEndsAt).toBeInstanceOf(Date);
    expect(company!.demoEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("регистрация не создаёт пользователя до ввода кода из письма", async () => {
    const start = await submitRegistration({
      organizationName: "ООО Код Потом",
      companyType: "collector",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+79000001000",
      email: "pending-code@test.local",
      password: "User12345678",
    });

    const pendingUser = await ctx.prisma.user.findUnique({ where: { email: "pending-code@test.local" } });
    expect(pendingUser).toBeNull();

    const wrongCode = await ctx.http
      .post("/api/auth/register/verify")
      .send({ verificationId: start.verificationId, code: "0000" });
    expect(wrongCode.status).toBe(400);

    const token = await verifyRegistration(start.verificationId);
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("pending-code@test.local");
  });

  it("без загруженного фото аватар профиля пустой (нейтральная иконка на фронте)", async () => {
    const adminToken = await loginAdmin();
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);

    expect(me.status).toBe(200);
    expect(me.body.gender).toBeNull();
    expect(me.body.avatarUrl).toBeNull();
    expect(me.body.company).toBeNull();
    expect(me.body.companyId).toBeNull();
    expect(me.body.requiresReConsent).toBe(false);
  });

  it("регистрация сохраняет тип компании и пол", async () => {
    const token = await registerWithBody({
      organizationName: "ООО Трейд Жен",
      companyType: "trader",
      firstName: "Анна",
      lastName: "Тестова",
      gender: "female",
      phone: "+375291234567",
      email: "trader-female@test.local",
      password: "User12345678",
    });

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.gender).toBe("female");
    expect(me.body.company.type).toBe("trader");
    expect(me.body.company.organizationName).toBe("ООО Трейд Жен");
    expect(me.body.avatarUrl).toBeNull();
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: me.body.company.id } });
    expect(company.billingInn).toBeNull();
  });

  it("регистрация без пола оставляет gender пустым, а профиль позволяет заполнить и очистить его", async () => {
    const token = await registerWithBody({
      organizationName: "ООО Без Пола",
      companyType: "collector",
      firstName: "Ольга",
      lastName: "Добровольная",
      phone: "+79000001001",
      email: "without-gender@test.local",
      password: "User12345678",
    });

    const initialMe = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(initialMe.status).toBe(200);
    expect(initialMe.body.gender).toBeNull();

    const setGender = await ctx.http
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: "female" });
    expect(setGender.status).toBe(200);
    expect(setGender.body.gender).toBe("female");

    const clearGender = await ctx.http
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ gender: null });
    expect(clearGender.status).toBe(200);
    expect(clearGender.body.gender).toBeNull();
  });

  it("повторная регистрация с тем же email отбивается 409", async () => {
    await registerCompany("0000002");
    const dup = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО Дубль",
      companyType: "collector",
      firstName: "А",
      lastName: "Б",
      gender: "male",
      phone: "+71111111111",
      email: "user0000002@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });
    expect(dup.status).toBe(409);
  });

  it("регистрация не принимает ИНН: реквизиты заполняются в профиле компании", async () => {
    const res = await ctx.http.post("/api/auth/register").send({
      organizationName: "ООО ИНН Потом",
      companyType: "collector",
      billingInn: "7707083893",
      firstName: "Иван",
      lastName: "Тестов",
      gender: "male",
      phone: "+71111111113",
      email: "bad-inn@test.local",
      password: "User12345678",
      acceptedDocumentIds: REQUIRED_DOC_IDS_FOR_TESTS,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("ИНН заполняется в профиле компании");
  });
});

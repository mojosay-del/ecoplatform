import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, registerWithBody } = ctx;

describe("Admin broadcast — рассылка in-app уведомлений с фильтрами", () => {
  async function registerTrader(suffix: string) {
    const token = await registerWithBody({
      organizationName: `ООО Трейдер ${suffix}`,
      companyType: "trader",
      firstName: "Тимур",
      lastName: "Трейдеров",
      phone: `+7990${suffix}`,
      email: `bcast-trader-${suffix}@test.local`,
      password: "User12345678",
    });
    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    return { token, userId: me.body.id as string };
  }

  function titlesFor(token: string) {
    return ctx.http
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`)
      .then((res) => (res.body.items as Array<{ title: string }>).map((item) => item.title));
  }

  it("фильтр по типу компании доставляет только целевой аудитории; чужие не получают", async () => {
    const adminToken = await loginAdmin();
    const collector = await registerCompany("0850001");
    const trader = await registerTrader("0850002");
    const title = `Объявление трейдерам ${Date.now()}`;

    const preview = await ctx.http
      .post("/api/admin/broadcast/recipients-count")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ audience: { companyType: "trader" } });
    expect(preview.status).toBe(201);
    expect(preview.body.recipientCount).toBeGreaterThanOrEqual(1);

    const send = await ctx.http
      .post("/api/admin/broadcast")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title, body: "Только для трейдеров.", audience: { companyType: "trader" } });
    expect(send.status).toBe(201);
    expect(send.body.recipientCount).toBeGreaterThanOrEqual(1);

    expect(await titlesFor(trader.token)).toContain(title);
    expect(await titlesFor(collector.token)).not.toContain(title);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { action: "admin.broadcast.send", payload: { path: ["title"], equals: title } },
    });
    expect(log).not.toBeNull();
  });

  it("не-админ не может рассылать", async () => {
    const collector = await registerCompany("0850003");
    const res = await ctx.http
      .post("/api/admin/broadcast")
      .set("Authorization", `Bearer ${collector.token}`)
      .send({ title: "x", body: "y", audience: {} });
    expect(res.status).toBe(403);
  });
});

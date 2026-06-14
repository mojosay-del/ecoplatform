import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { registerCompany, registerWithBody } = ctx;

// Валидный блок настроек: один грузовик, один водитель-почасовик, цены сырья,
// помощник амортизации. version опущен — сервер подставит дефолт (1).
const validSettings = {
  vehicles: [{ id: "v1", name: "Газель", fuel: "15", deprec: "8", speed: "50" }],
  selectedVehicleId: "v1",
  workers: [{ id: "w1", name: "Водитель (он же грузчик)", type: "hour", value: "300", base: "margin" }],
  fuelPrice: "60",
  loadTime: "0.5",
  otherCosts: "0",
  materialPrices: [
    { slug: "makulatura", buy: "7", sell: "12" },
    { slug: "plenki", buy: "15", sell: "30" },
  ],
  amort: { repair: "120000", tires: "40000", replace: "150000", mileage: "40000" },
};

async function registerTrader(suffix: string): Promise<string> {
  return registerWithBody({
    organizationName: `ООО Трейдер ${suffix}`,
    companyType: "trader",
    firstName: "Пётр",
    lastName: "Трейдеров",
    gender: "male",
    phone: `+7901${suffix}`,
    email: `trader${suffix}@test.local`,
    password: "Trader12345678",
  });
}

describe("Калькулятор рейса: настройки компании-заготовителя", () => {
  it("заготовитель: пустые настройки → null, сохранение → чтение того же блока", async () => {
    const { token } = await registerCompany("910");

    const empty = await ctx.http.get("/api/trip-calculator/settings").set("Authorization", `Bearer ${token}`);
    expect(empty.status).toBe(200);
    expect(empty.body.settings).toBeNull();

    const saved = await ctx.http
      .patch("/api/trip-calculator/settings")
      .set("Authorization", `Bearer ${token}`)
      .send(validSettings);
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(1);
    expect(saved.body.vehicles).toHaveLength(1);
    expect(saved.body.vehicles[0].name).toBe("Газель");
    expect(saved.body.workers[0].type).toBe("hour");
    expect(saved.body.materialPrices).toHaveLength(2);

    const reread = await ctx.http.get("/api/trip-calculator/settings").set("Authorization", `Bearer ${token}`);
    expect(reread.status).toBe(200);
    expect(reread.body.settings.fuelPrice).toBe("60");
    expect(reread.body.settings.selectedVehicleId).toBe("v1");
  });

  it("повторное сохранение перезаписывает блок (upsert), компания делит один набор", async () => {
    const { token } = await registerCompany("911");

    await ctx.http
      .patch("/api/trip-calculator/settings")
      .set("Authorization", `Bearer ${token}`)
      .send(validSettings);

    const updated = await ctx.http
      .patch("/api/trip-calculator/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validSettings, fuelPrice: "62", workers: [{ ...validSettings.workers[0], value: "350" }] });
    expect(updated.status).toBe(200);
    expect(updated.body.fuelPrice).toBe("62");
    expect(updated.body.workers[0].value).toBe("350");
  });

  it("трейдер не имеет доступа: 403 на чтение и сохранение", async () => {
    const traderToken = await registerTrader("970");

    const read = await ctx.http.get("/api/trip-calculator/settings").set("Authorization", `Bearer ${traderToken}`);
    expect(read.status).toBe(403);

    const write = await ctx.http
      .patch("/api/trip-calculator/settings")
      .set("Authorization", `Bearer ${traderToken}`)
      .send(validSettings);
    expect(write.status).toBe(403);
  });

  it("без авторизации → 401", async () => {
    const res = await ctx.http.get("/api/trip-calculator/settings");
    expect(res.status).toBe(401);
  });

  it("битый блок (пустой парк машин) → 400", async () => {
    const { token } = await registerCompany("912");
    const res = await ctx.http
      .patch("/api/trip-calculator/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validSettings, vehicles: [] });
    expect(res.status).toBe(400);
  });
});

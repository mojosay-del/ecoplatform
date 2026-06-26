import { CompanyStatus, SubscriptionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { expectPaginatedEnvelope } from "./test/integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, createCompanyMember } = ctx;

describe("Demo gating", () => {
  it("свежезарегистрированный пользователь без выбранного trial не видит /api/news", async () => {
    const { token } = await registerCompany("0000010", { activateTrial: false });
    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(403);
  });

  it("самостоятельная активация пробного доступа открывает /api/news на 24 часа один раз", async () => {
    const { token, companyId } = await registerCompany("0000015", { activateTrial: false });

    const closed = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(closed.status).toBe(403);

    const key = `self-trial-${companyId}`;
    const first = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key);

    expect(first.status).toBe(201);
    expect(first.body.company.status).toBe("demo");
    expect(first.body.company.demoEndsAt).toBe(first.body.trialEndsAt);
    expect(new Date(first.body.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    const second = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const open = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(open.status).toBe(200);

    const conflict = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-trial-repeat-${companyId}`);
    expect(conflict.status).toBe(409);

    const [logs, subscriptions] = await Promise.all([
      ctx.prisma.adminActionLog.findMany({
        where: { action: "self_trial_activation", entityId: companyId },
      }),
      ctx.prisma.subscription.findMany({ where: { companyId } }),
    ]);
    expect(logs).toHaveLength(1);
    expect(subscriptions).toHaveLength(0);
    const payload = logs[0].payload as {
      before: { demoEndsAt: string | null };
      after: { demoEndsAt: string | null };
      durationHours: number;
      source: string;
    };
    expect(payload.before.demoEndsAt).toBeNull();
    expect(payload.after.demoEndsAt).toBe(first.body.trialEndsAt);
    expect(payload.durationHours).toBe(24);
    expect(payload.source).toBe("subscription_page");
  });

  it("после истечения demo /api/news → 403, /api/billing/status и /api/auth/me остаются доступны", async () => {
    const { token, companyId } = await registerCompany("0000011");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(403);

    const billing = await ctx.http.get("/api/billing/status").set("Authorization", `Bearer ${token}`);
    expect(billing.status).toBe(200);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it("ручная активация админом возвращает доступ к функциональным разделам", async () => {
    const { token, companyId } = await registerCompany("0000012");
    // 1. Demo истёк
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    expect((await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`)).status).toBe(403);

    // 2. Админ активирует
    const adminToken = await loginAdmin();
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const act = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-activate-${companyId}`)
      .send({ companyId, plan: "basic", endsAt, reason: "integration-test" });
    expect(act.status).toBe(201);
    expect(act.body.company.status).toBe("active");
    expect(act.body.company.subscriptionPlan).toBe("basic");

    // 3. Доступ восстановлен
    const news = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(news.status).toBe(200);
  });

  it("ручная активация подписки с датой в прошлом отклоняется без записи", async () => {
    const { companyId } = await registerCompany("0000014");
    const adminToken = await loginAdmin();
    const pastEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const res = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-past-date-${companyId}`)
      .send({ companyId, plan: "basic", endsAt: pastEndsAt, reason: "past-date-test" });

    expect(res.status).toBe(400);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(0);
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.demo);
  });

  it("ручная активация подписки идемпотентна по Idempotency-Key", async () => {
    const { companyId, userId } = await registerCompany("0000013");
    const adminToken = await loginAdmin();
    const endsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const payload = { companyId, plan: "extended", endsAt, reason: "double-click-test" };
    const key = `manual-idempotency-${companyId}`;

    const first = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const conflict = await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send({ ...payload, reason: "different-payload" });
    expect(conflict.status).toBe(409);

    const [subscriptions, logs, notifications, deliveries] = await Promise.all([
      ctx.prisma.subscription.findMany({ where: { companyId } }),
      ctx.prisma.adminActionLog.findMany({
        where: { action: "manual_subscription_activation", entityId: companyId },
      }),
      ctx.prisma.inAppNotification.findMany({
        where: { userId, eventType: "billing.subscription.activated" },
      }),
      ctx.prisma.notificationDelivery.findMany({
        where: {
          recipientUserId: userId,
          eventType: "billing.subscription.activated",
        },
      }),
    ]);

    expect(subscriptions).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    expect(deliveries).toHaveLength(2);

    // Волна 9.7: payload админ-журнала пишется в формате before/after/diff.
    const auditPayload = logs[0].payload as {
      before: { status: string; subscriptionPlan: string };
      after: { status: string; subscriptionPlan: string };
      diff: Record<string, { before: unknown; after: unknown }>;
      subscriptionId: string;
    };
    expect(auditPayload.before.status).toBe("demo");
    expect(auditPayload.after.status).toBe("active");
    expect(auditPayload.after.subscriptionPlan).toBe("extended");
    expect(auditPayload.diff.status).toEqual({ before: "demo", after: "active" });
    expect(auditPayload.diff.subscriptionPlan.after).toBe("extended");
    expect(auditPayload.subscriptionId).toBe(subscriptions[0].id);
  });

  it("самостоятельная активация Базовой подписки возвращает доступ на месяц", async () => {
    const { token, companyId, userId } = await registerCompany("0000016");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const closed = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(closed.status).toBe(403);

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-basic-${companyId}`)
      .send({ plan: "basic" });

    expect(res.status).toBe(201);
    expect(res.body.company.status).toBe("active");
    expect(res.body.company.subscriptionPlan).toBe("basic");
    expect(new Date(res.body.subscription.endsAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    const open = await ctx.http.get("/api/news").set("Authorization", `Bearer ${token}`);
    expect(open.status).toBe(200);

    const [logs, notifications] = await Promise.all([
      ctx.prisma.adminActionLog.findMany({
        where: { action: "self_subscription_activation", entityId: companyId },
      }),
      ctx.prisma.inAppNotification.findMany({
        where: { userId, eventType: "billing.subscription.activated" },
      }),
    ]);
    expect(logs).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    const payload = logs[0].payload as {
      before: { status: string };
      after: { status: string; subscriptionPlan: string };
      durationDays: number;
      source: string;
    };
    expect(payload.before.status).toBe("demo");
    expect(payload.after.status).toBe("active");
    expect(payload.after.subscriptionPlan).toBe("basic");
    expect(payload.durationDays).toBe(30);
    expect(payload.source).toBe("subscription_page");
  });

  it("участник компании не может самостоятельно активировать подписку", async () => {
    const { companyId } = await registerCompany("0000020");
    const member = await createCompanyMember(companyId, "0000020");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", `self-member-reject-${companyId}`)
      .send({ plan: "basic" });

    expect(res.status).toBe(403);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(0);
    await expect(
      ctx.prisma.adminActionLog.count({ where: { action: "self_subscription_activation", entityId: companyId } }),
    ).resolves.toBe(0);
  });

  it("участник компании не может самостоятельно включить пробный доступ", async () => {
    const { companyId } = await registerCompany("0000021", { activateTrial: false });
    const member = await createCompanyMember(companyId, "0000021");

    const res = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${member.token}`)
      .set("Idempotency-Key", `self-trial-member-reject-${companyId}`);

    expect(res.status).toBe(403);
    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.demoEndsAt).toBeNull();
    await expect(
      ctx.prisma.adminActionLog.count({ where: { action: "self_trial_activation", entityId: companyId } }),
    ).resolves.toBe(0);
  });

  it("самостоятельная активация Расширенной подписки работает после истечения платной подписки", async () => {
    const adminToken = await loginAdmin();
    const { token, companyId } = await registerCompany("0000017");
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-before-self-${companyId}`)
      .send({
        companyId,
        plan: "basic",
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        reason: "initial-paid-test",
      });
    const pastEndsAt = new Date(Date.now() - 60 * 60 * 1000);
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.past_due, subscriptionEndsAt: pastEndsAt },
    });
    await ctx.prisma.subscription.updateMany({
      where: { companyId },
      data: { status: SubscriptionStatus.expired, endsAt: pastEndsAt },
    });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-extended-${companyId}`)
      .send({ plan: "extended" });

    expect(res.status).toBe(201);
    expect(res.body.company.status).toBe("active");
    expect(res.body.company.subscriptionPlan).toBe("extended");
  });

  it("самостоятельная активация идемпотентна и не создаёт дубль подписки", async () => {
    const { token, companyId } = await registerCompany("0000018");
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    const key = `self-idempotency-${companyId}`;

    const first = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "basic" });
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "basic" });
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const conflict = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ plan: "extended" });
    expect(conflict.status).toBe(409);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(1);
  });

  it("самостоятельная активация не продлевает уже активную подписку бесплатно", async () => {
    const adminToken = await loginAdmin();
    const { token, companyId } = await registerCompany("0000019");
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `manual-active-before-self-${companyId}`)
      .send({
        companyId,
        plan: "basic",
        endsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        reason: "active-subscription-test",
      });

    const res = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `self-active-reject-${companyId}`)
      .send({ plan: "extended" });

    expect(res.status).toBe(409);
    await expect(ctx.prisma.subscription.count({ where: { companyId } })).resolves.toBe(1);
  });

  it("платформенный сотрудник не может активировать клиентскую подписку для себя", async () => {
    const adminToken = await loginAdmin();
    const subscription = await ctx.http
      .post("/api/billing/subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", "self-platform-staff")
      .send({ plan: "basic" });
    const trial = await ctx.http
      .post("/api/billing/trial")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", "self-trial-platform-staff");

    expect(subscription.status).toBe(403);
    expect(trial.status).toBe(403);
  });

  it("админский список billing-компаний валидирует pagination query", async () => {
    const adminToken = await loginAdmin();
    await registerCompany("0000022");

    const bad = await ctx.http
      .get("/api/admin/billing/companies?limit=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);

    const good = await ctx.http
      .get("/api/admin/billing/companies?limit=1&offset=0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(good.status).toBe(200);
    expectPaginatedEnvelope(good.body);
    expect(good.body.items).toHaveLength(1);
  });

  it("billing summary возвращает агрегаты активных и истекающих подписок", async () => {
    const adminToken = await loginAdmin();
    const { companyId } = await registerCompany("0000023");
    const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await ctx.http
      .post("/api/admin/billing/manual-subscriptions")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `summary-${companyId}`)
      .send({ companyId, plan: "basic", endsAt, reason: "summary-test" });

    const summary = await ctx.http.get("/api/admin/billing/summary").set("Authorization", `Bearer ${adminToken}`);
    expect(summary.status).toBe(200);
    expect(typeof summary.body.activeSubscriptions).toBe("number");
    expect(typeof summary.body.expiringSoon).toBe("number");
    expect(summary.body.activeSubscriptions).toBeGreaterThanOrEqual(1);
  });

  it("поиск billing-компаний фильтрует по названию", async () => {
    const adminToken = await loginAdmin();
    await registerCompany("0000024");
    const all = await ctx.http.get("/api/admin/billing/companies?limit=5").set("Authorization", `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    const term: string = String(all.body.items[0].organizationName).slice(0, 4);

    const found = await ctx.http
      .get(`/api/admin/billing/companies?search=${encodeURIComponent(term)}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(found.status).toBe(200);
    expect(found.body.items.length).toBeGreaterThanOrEqual(1);
    expect(
      found.body.items.every((c: { organizationName: string }) =>
        c.organizationName.toLowerCase().includes(term.toLowerCase()),
      ),
    ).toBe(true);
  });
});

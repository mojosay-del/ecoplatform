import { NotificationCategory, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBroadcastService } from "./admin-broadcast.service";

function setup(recipients: Array<{ id: string }> = []) {
  const count = vi.fn().mockResolvedValue(recipients.length);
  const findMany = vi.fn().mockResolvedValue(recipients);
  const createInApp = vi.fn().mockResolvedValue(null);
  const record = vi.fn().mockResolvedValue(undefined);

  const prisma = { user: { count, findMany } } as never;
  const notifications = { createInApp } as never;
  const auditLog = { record } as never;
  const service = new AdminBroadcastService(prisma, notifications, auditLog);
  return { service, count, findMany, createInApp, record };
}

const actor = { id: "admin-1" } as never;

describe("AdminBroadcastService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("по умолчанию шлёт только активным, без фильтров", async () => {
    const { service, count } = setup([{ id: "u1" }]);
    await service.recipientsCount({});
    expect(count).toHaveBeenCalledWith({ where: { status: UserStatus.active } });
  });

  it("includeBlocked снимает фильтр статуса", async () => {
    const { service, count } = setup();
    await service.recipientsCount({ includeBlocked: true });
    expect(count).toHaveBeenCalledWith({ where: { status: undefined } });
  });

  it("собирает where по полу, роли, типу компании и подписке", async () => {
    const { service, count } = setup();
    await service.recipientsCount({
      gender: "female",
      companyRole: "owner",
      companyType: "trader",
      subscriptionPlan: "extended",
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        status: UserStatus.active,
        gender: "female",
        companyRole: "owner",
        company: { is: { type: "trader", subscriptionPlan: "extended" } },
      },
    });
  });

  it("send создаёт по системному in-app уведомлению на каждого получателя и пишет аудит", async () => {
    const { service, createInApp, record } = setup([{ id: "u1" }, { id: "u2" }]);
    const result = await service.send({ title: "Привет", body: "Тело", audience: { companyType: "collector" } }, actor);

    expect(result.recipientCount).toBe(2);
    expect(createInApp).toHaveBeenCalledTimes(2);
    expect(createInApp).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        category: NotificationCategory.system,
        eventType: "admin.broadcast",
        title: "Привет",
        body: "Тело",
      }),
    );
    // У каждого получателя свой domainEventId — две записи, без коллизии уникальности.
    const ids = createInApp.mock.calls.map((call) => (call[0] as { domainEventId: string }).domainEventId);
    expect(new Set(ids).size).toBe(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.broadcast.send",
        payload: expect.objectContaining({ recipientCount: 2, title: "Привет" }),
      }),
    );
  });
});

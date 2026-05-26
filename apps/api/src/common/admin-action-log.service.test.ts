import { describe, expect, it, vi } from "vitest";
import { AdminActionLogService, computeDiff } from "./admin-action-log.service";

describe("computeDiff", () => {
  it("возвращает только изменённые поля", () => {
    const diff = computeDiff({ status: "active", plan: "demo" }, { status: "blocked", plan: "demo" });
    expect(diff).toEqual({ status: { before: "active", after: "blocked" } });
  });

  it("новое поле фиксируется как добавление (before: null)", () => {
    const diff = computeDiff({}, { plan: "extended" });
    expect(diff).toEqual({ plan: { before: null, after: "extended" } });
  });

  it("удалённое поле фиксируется как удаление (after: null)", () => {
    const diff = computeDiff({ plan: "extended" }, {});
    expect(diff).toEqual({ plan: { before: "extended", after: null } });
  });

  it("массивы одинакового состава считаются равными", () => {
    expect(computeDiff({ roles: ["admin", "support"] }, { roles: ["admin", "support"] })).toEqual({});
  });

  it("массивы разного содержимого попадают в diff целиком", () => {
    const diff = computeDiff({ roles: ["admin"] }, { roles: ["admin", "support"] });
    expect(diff).toEqual({ roles: { before: ["admin"], after: ["admin", "support"] } });
  });

  it("вложенные объекты сравниваются по сериализованной форме", () => {
    expect(computeDiff({ meta: { a: 1, b: 2 } }, { meta: { a: 1, b: 2 } })).toEqual({});
    expect(computeDiff({ meta: { a: 1 } }, { meta: { a: 2 } })).toEqual({
      meta: { before: { a: 1 }, after: { a: 2 } },
    });
  });

  it("одинаковые snapshot'ы дают пустой diff", () => {
    expect(computeDiff({ status: "active" }, { status: "active" })).toEqual({});
  });
});

describe("AdminActionLogService.recordChange", () => {
  it("кладёт before/after/diff и extra в payload", async () => {
    const create = vi.fn().mockResolvedValue({ id: "log-1" });
    const prisma = { adminActionLog: { create } } as unknown as ConstructorParameters<typeof AdminActionLogService>[0];
    const service = new AdminActionLogService(prisma);

    await service.recordChange({
      actorId: "admin-1",
      action: "admin.company.status",
      entityType: "Company",
      entityId: "company-1",
      comment: "за нарушение",
      before: { status: "active" },
      after: { status: "blocked" },
      extra: { reasonCode: "spam" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0].data.payload;
    expect(payload).toEqual({
      before: { status: "active" },
      after: { status: "blocked" },
      diff: { status: { before: "active", after: "blocked" } },
      reasonCode: "spam",
    });
    expect(create.mock.calls[0][0].data.comment).toBe("за нарушение");
  });

  it("пустой diff не мешает записи (актор подтвердил отсутствие изменений)", async () => {
    const create = vi.fn().mockResolvedValue({ id: "log-2" });
    const prisma = { adminActionLog: { create } } as unknown as ConstructorParameters<typeof AdminActionLogService>[0];
    const service = new AdminActionLogService(prisma);

    await service.recordChange({
      actorId: "admin-1",
      action: "admin.setting.update",
      entityType: "PlatformSetting",
      entityId: "billing.demo_days",
      before: { value: 14 },
      after: { value: 14 },
    });

    const payload = create.mock.calls[0][0].data.payload;
    expect(payload.diff).toEqual({});
    expect(payload.before).toEqual({ value: 14 });
    expect(payload.after).toEqual({ value: 14 });
  });
});

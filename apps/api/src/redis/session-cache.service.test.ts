import { describe, expect, it, vi } from "vitest";
import type { RequestUser } from "../common/request-user";
import { SessionCacheService } from "./session-cache.service";

function createRedisMock() {
  const json = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  return {
    getJson: vi.fn(async (key: string) => (json.get(key) ?? null) as RequestUser | null),
    setJson: vi.fn(async (key: string, value: unknown) => {
      json.set(key, value);
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const key of keys) {
        json.delete(key);
        sets.delete(key);
      }
    }),
    sadd: vi.fn(async (key: string, members: string[]) => {
      const bucket = sets.get(key) ?? new Set<string>();
      for (const member of members) bucket.add(member);
      sets.set(key, bucket);
    }),
    smembers: vi.fn(async (key: string) => Array.from(sets.get(key) ?? [])),
  };
}

function requestUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: "user-1",
    email: "user@example.test",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "+70000000000",
    companyId: "company-1",
    platformRoles: [],
    company: {
      type: "collector",
      status: "active",
      demoEndsAt: null,
      subscriptionPlan: "demo",
      subscriptionEndsAt: null,
    },
    sessionId: "session-1",
    ...overrides,
  };
}

describe("SessionCacheService", () => {
  it("кладёт сессию в кеш и индексирует её по пользователю и компании", async () => {
    const redis = createRedisMock();
    const service = new SessionCacheService(redis as any);
    const user = requestUser();

    await service.set(user);

    expect(redis.setJson).toHaveBeenCalledWith("auth:session:session-1", user, 60);
    expect(redis.sadd).toHaveBeenCalledWith("auth:user-sessions:user-1", ["session-1"], 60);
    expect(redis.sadd).toHaveBeenCalledWith("auth:company-sessions:company-1", ["session-1"], 60);
    await expect(service.get("session-1")).resolves.toEqual(user);
  });

  it("инвалидирует все закешированные сессии пользователя", async () => {
    const redis = createRedisMock();
    const service = new SessionCacheService(redis as any);
    await service.set(requestUser({ sessionId: "session-1" }));
    await service.set(requestUser({ sessionId: "session-2" }));

    await service.invalidateUser("user-1");

    expect(redis.del).toHaveBeenLastCalledWith(
      "auth:session:session-1",
      "auth:session:session-2",
      "auth:user-sessions:user-1",
    );
    await expect(service.get("session-1")).resolves.toBeNull();
    await expect(service.get("session-2")).resolves.toBeNull();
  });

  it("инвалидирует все закешированные сессии компании", async () => {
    const redis = createRedisMock();
    const service = new SessionCacheService(redis as any);
    await service.set(requestUser({ id: "user-1", sessionId: "session-1" }));
    await service.set(requestUser({ id: "user-2", sessionId: "session-2" }));

    await service.invalidateCompany("company-1");

    expect(redis.del).toHaveBeenLastCalledWith(
      "auth:session:session-1",
      "auth:session:session-2",
      "auth:company-sessions:company-1",
    );
    await expect(service.get("session-1")).resolves.toBeNull();
    await expect(service.get("session-2")).resolves.toBeNull();
  });
});

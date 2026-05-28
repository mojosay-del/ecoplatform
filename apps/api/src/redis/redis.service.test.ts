import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedisService } from "./redis.service";

describe("RedisService fallback safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T09:00:00.000Z"));
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("временно перестаёт читать Redis после ошибки команды", async () => {
    const service = new RedisService();
    const client = {
      status: "ready",
      get: vi.fn().mockRejectedValue(new Error("temporary redis failure")),
    };
    (service as unknown as { client: typeof client }).client = client;

    await expect(service.getJson("auth:session:session-1")).resolves.toBeNull();

    expect(service.status).toBe("fallback");
    expect(service.getClient()).toBeNull();

    vi.advanceTimersByTime(60_001);

    expect(service.getClient()).toBe(client);
  });
});

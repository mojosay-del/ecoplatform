import { describe, expect, it, vi } from "vitest";
import { RedisThrottlerStorageService } from "./redis-throttler-storage.service";

describe("RedisThrottlerStorageService", () => {
  it("использует Redis eval и возвращает record в формате @nestjs/throttler", async () => {
    const evalMock = vi.fn().mockResolvedValue([2, 10, 1, 60]);
    const storage = new RedisThrottlerStorageService({
      getClient: () => ({ eval: evalMock }),
    } as any);

    const result = await storage.increment("hashed-key", 10_000, 1, 60_000, "auth");

    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      2,
      "throttle:auth:hashed-key",
      "throttle:auth:hashed-key:blocked",
      "10000",
      "1",
      "60000",
    );
    expect(result).toEqual({
      totalHits: 2,
      timeToExpire: 10,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });
});

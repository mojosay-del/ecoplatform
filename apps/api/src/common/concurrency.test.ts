import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order in results", async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("passes the index to the mapper", async () => {
    const result = await mapWithConcurrency(["a", "b", "c"], 3, async (item, index) => `${index}:${item}`);
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
      },
    );
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("handles an empty list without spawning workers", async () => {
    const result = await mapWithConcurrency([], 4, async () => {
      throw new Error("should not be called");
    });
    expect(result).toEqual([]);
  });

  it("rejects an invalid limit", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(/positive integer/);
  });
});

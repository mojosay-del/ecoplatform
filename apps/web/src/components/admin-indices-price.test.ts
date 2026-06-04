import { describe, expect, it } from "vitest";
import { normalizeIntegerPriceInput, parseIntegerPriceInput } from "./admin-indices-price";

describe("admin indices price input", () => {
  it("formats integer ruble prices with spaces", () => {
    expect(normalizeIntegerPriceInput("12300")).toBe("12 300");
    expect(normalizeIntegerPriceInput("12 300")).toBe("12 300");
    expect(parseIntegerPriceInput("12 300")).toBe(12300);
  });

  it("rejects decimal price input", () => {
    expect(normalizeIntegerPriceInput("12,3")).toBeNull();
    expect(normalizeIntegerPriceInput("12.3")).toBeNull();
    expect(parseIntegerPriceInput("12,3")).toBeNull();
    expect(parseIntegerPriceInput("12.3")).toBeNull();
  });
});

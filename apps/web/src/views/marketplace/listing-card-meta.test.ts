import { describe, expect, it } from "vitest";
import {
  daysUntilExpiry,
  expiryLabel,
  formatDistanceKm,
  isExpiringSoon,
  isFreshListing,
  memberSinceLabel,
} from "./listing-card-meta";

const NOW = Date.parse("2026-06-12T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("daysUntilExpiry", () => {
  it("округляет вверх: остаток меньше суток — это 1 день", () => {
    expect(daysUntilExpiry(new Date(NOW + 4 * HOUR_MS).toISOString(), NOW)).toBe(1);
    expect(daysUntilExpiry(new Date(NOW + 2 * DAY_MS + HOUR_MS).toISOString(), NOW)).toBe(3);
  });

  it("истёкшее — 0, отсутствие/мусор — null", () => {
    expect(daysUntilExpiry(new Date(NOW - HOUR_MS).toISOString(), NOW)).toBe(0);
    expect(daysUntilExpiry(null, NOW)).toBeNull();
    expect(daysUntilExpiry("не-дата", NOW)).toBeNull();
  });
});

describe("isExpiringSoon", () => {
  it("срабатывает на пороге 3 дней и не раньше", () => {
    expect(isExpiringSoon(new Date(NOW + 2 * DAY_MS).toISOString(), NOW)).toBe(true);
    expect(isExpiringSoon(new Date(NOW + 3 * DAY_MS).toISOString(), NOW)).toBe(true);
    expect(isExpiringSoon(new Date(NOW + 4 * DAY_MS).toISOString(), NOW)).toBe(false);
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });
});

describe("expiryLabel", () => {
  it("последние сутки — в часах, дальше — в днях", () => {
    expect(expiryLabel(new Date(NOW + 5 * HOUR_MS).toISOString(), NOW)).toBe("Истекает через 5 ч");
    expect(expiryLabel(new Date(NOW + 2 * DAY_MS).toISOString(), NOW)).toBe("Истекает через 2 дн");
    expect(expiryLabel(new Date(NOW - HOUR_MS).toISOString(), NOW)).toBe("Истекает");
    expect(expiryLabel(null, NOW)).toBeNull();
  });
});

describe("formatDistanceKm", () => {
  it("округляет до километра и сворачивает близкие в «менее 1 км»", () => {
    expect(formatDistanceKm(11.6)).toBe("≈ 12 км");
    expect(formatDistanceKm(0.4)).toBe("менее 1 км");
    expect(formatDistanceKm(Number.NaN)).toBe("");
    expect(formatDistanceKm(-5)).toBe("");
  });
});

describe("isFreshListing", () => {
  it("свежее — моложе 24 часов, будущая дата публикации не считается свежей", () => {
    expect(isFreshListing(new Date(NOW - 23 * HOUR_MS).toISOString(), NOW)).toBe(true);
    expect(isFreshListing(new Date(NOW - 25 * HOUR_MS).toISOString(), NOW)).toBe(false);
    expect(isFreshListing(new Date(NOW + HOUR_MS).toISOString(), NOW)).toBe(false);
    expect(isFreshListing(null, NOW)).toBe(false);
  });
});

describe("memberSinceLabel", () => {
  it("месяц в родительном падеже", () => {
    expect(memberSinceLabel("2025-06-05T10:00:00Z")).toBe("с июня 2025");
    expect(memberSinceLabel("2024-01-15T10:00:00Z")).toBe("с января 2024");
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel("мусор")).toBeNull();
  });
});

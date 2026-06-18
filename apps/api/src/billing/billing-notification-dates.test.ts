import { describe, expect, it } from "vitest";
import { formatBillingNotificationDateTime } from "./billing-notification-dates";

describe("formatBillingNotificationDateTime", () => {
  it("форматирует дату уведомления без секунд", () => {
    const formatted = formatBillingNotificationDateTime(new Date(2026, 6, 1, 19, 31, 28));

    expect(formatted).toContain("01.07.2026");
    expect(formatted).toContain("19:31");
    expect(formatted).not.toContain("19:31:28");
  });
});

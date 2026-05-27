import { describe, expect, it } from "vitest";
import {
  COMPANY_STATUS_LABELS,
  MODERATION_DECISION_LABELS,
  SUPPORT_CATEGORY_LABELS,
  formatAuditFieldLabel,
  formatAuditValue,
  formatPlatformRoles,
} from "./display-labels";

describe("display labels", () => {
  it("covers current and planned enum values with Russian labels", () => {
    expect(COMPANY_STATUS_LABELS.pending_deletion).toBe("Удаление запланировано");
    expect(SUPPORT_CATEGORY_LABELS.marketplace_dispute).toBe("Спор на площадке");
    expect(MODERATION_DECISION_LABELS.remove_content).toBe("Снять контент");
  });

  it("formats roles and audit diff values without raw enum strings", () => {
    expect(formatPlatformRoles(["admin", "content_manager"])).toBe("Админ, Контент-менеджер");
    expect(formatAuditFieldLabel("subscriptionPlan")).toBe("Тариф");
    expect(formatAuditValue("reasonCode", "policy_violation")).toBe("Нарушение правил");
    expect(formatAuditValue("roles", ["admin", "moderator"])).toBe("Админ, Модератор");
    expect(formatAuditValue("isActive", false)).toBe("Нет");
  });
});

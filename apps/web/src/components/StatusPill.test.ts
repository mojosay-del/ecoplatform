import { describe, expect, it } from "vitest";
import {
  companyStatusPillVariant,
  moderationStatusPillVariant,
  subscriptionStatusPillVariant,
  supportStatusPillVariant,
  userStatusPillVariant,
} from "./status-pill-variants";

describe("StatusPill semantic variants", () => {
  it("maps company statuses to MVP color semantics", () => {
    expect(companyStatusPillVariant("active")).toBe("success");
    expect(companyStatusPillVariant("demo")).toBe("warning");
    expect(companyStatusPillVariant("past_due")).toBe("danger");
    expect(companyStatusPillVariant("archived")).toBe("neutral");
  });

  it("maps common domain statuses without relying on raw CSS classes", () => {
    expect(subscriptionStatusPillVariant("expired")).toBe("danger");
    expect(supportStatusPillVariant("in_progress")).toBe("brand");
    expect(userStatusPillVariant("blocked")).toBe("danger");
    expect(moderationStatusPillVariant("resolved")).toBe("success");
  });
});

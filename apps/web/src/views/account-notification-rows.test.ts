import { describe, expect, it } from "vitest";
import type { PlatformRole } from "@ecoplatform/shared";
import { accountNotificationRowsForRoles } from "./account-notification-rows";

const expectedCategories = ["security", "billing", "marketplace", "moderation", "support", "system"];

describe("account notification rows", () => {
  it.each<[string, PlatformRole[]]>([
    ["regular user", []],
    ["admin", ["admin"]],
    ["moderator", ["moderator"]],
    ["content manager", ["content_manager"]],
    ["mixed platform staff", ["content_manager", "moderator"]],
  ])("shows the same cabinet categories for %s", (_label, roles) => {
    expect(accountNotificationRowsForRoles(roles).map((row) => row.category)).toEqual(expectedCategories);
  });
});

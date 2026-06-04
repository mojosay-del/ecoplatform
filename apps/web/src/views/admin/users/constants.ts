import { platformRoles } from "@ecoplatform/shared";
import { USER_STATUS_LABELS, formatPlatformRoles } from "../../../lib/display-labels";
import type { AdminUserListItem, UserSortKey } from "./types";

export const blockReasonCodes = [
  "policy_violation",
  "fraud",
  "suspicious_activity",
  "support_request",
  "other",
] as const;

export const allRoles = platformRoles;
export type PlatformRole = (typeof allRoles)[number];

export const userSortSelectors: Record<UserSortKey, (item: AdminUserListItem) => string | number> = {
  name: (item) => `${item.lastName} ${item.firstName}`,
  status: (item) => USER_STATUS_LABELS[item.status] ?? item.status,
  company: (item) => item.company?.organizationName ?? "",
  role: (item) => formatPlatformRoles(item.platformStaff?.roles ?? []),
  phone: (item) => item.phone,
  createdAt: (item) => Date.parse(item.createdAt),
};

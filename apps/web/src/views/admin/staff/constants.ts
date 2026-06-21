import { platformRoles } from "@ecoplatform/shared";
import type { SortValue } from "../../../components/admin-table-utils";
import { STAFF_STATUS_LABELS, USER_GENDER_LABELS, formatPlatformRoles } from "../../../lib/display-labels";
import type { CreateStaffForm, StaffFilters, StaffItem, StaffSortKey } from "./types";

export const ADMIN_STAFF_PAGE_SIZE = 30;
export const allStaffRoles = platformRoles;

export const EMPTY_STAFF_FILTERS: StaffFilters = { search: "", status: "", role: "" };

export const EMPTY_CREATE_STAFF_FORM: CreateStaffForm = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  gender: "",
  password: "",
  roles: ["moderator"],
};

export const genderOptions = [
  { value: "", label: "Не указано" },
  { value: "male", label: USER_GENDER_LABELS.male },
  { value: "female", label: USER_GENDER_LABELS.female },
] as const;

export const staffSortSelectors: Record<StaffSortKey, (item: StaffItem) => SortValue> = {
  name: (item) => `${item.user.lastName} ${item.user.firstName}`,
  status: (item) => (item.isActive ? STAFF_STATUS_LABELS.active : STAFF_STATUS_LABELS.inactive),
  role: (item) => formatPlatformRoles(item.roles),
  email: (item) => item.user.email,
  createdAt: (item) => Date.parse(item.createdAt),
};

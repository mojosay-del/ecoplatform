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

// Сильный временный пароль для сброса админом. Гарантируем по символу из
// каждого класса (верх/низ/цифра/спецсимвол) + добор до 16 символов, чтобы
// проходить политику и не попадать в базы утечек.
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_";
  const all = upper + lower + digits + symbols;
  // charAt никогда не возвращает undefined — безопасно под strict index access.
  const pick = (set: string): string => set.charAt(Math.floor(randomFraction() * set.length));
  const chars: string[] = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));
  // Тасуем, чтобы обязательные символы не стояли всегда в начале.
  return chars.sort(() => randomFraction() - 0.5).join("");
}

function randomFraction(): number {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoObj.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 2 ** 32;
  }
  return Math.random();
}

export const staffSortSelectors: Record<StaffSortKey, (item: StaffItem) => SortValue> = {
  name: (item) => `${item.user.lastName} ${item.user.firstName}`,
  status: (item) => (item.isActive ? STAFF_STATUS_LABELS.active : STAFF_STATUS_LABELS.inactive),
  role: (item) => formatPlatformRoles(item.roles),
  email: (item) => item.user.email,
  createdAt: (item) => Date.parse(item.createdAt),
};

import type { UserGender } from "@ecoplatform/shared";
import { USER_GENDER_LABELS } from "../../lib/display-labels";

export type ContactField = "email" | "phone";

export const GENDER_OPTIONS: Array<{ value: "" | UserGender; label: string }> = [
  { value: "", label: "Не указано" },
  { value: "male", label: USER_GENDER_LABELS.male ?? "Мужской" },
  { value: "female", label: USER_GENDER_LABELS.female ?? "Женский" },
];

export function getGenderLabel(value: UserGender | null | undefined) {
  const currentValue = value ?? "";
  return GENDER_OPTIONS.find((option) => option.value === currentValue)?.label ?? GENDER_OPTIONS[0]!.label;
}

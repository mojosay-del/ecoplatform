"use client";

import { AdminIconPicker } from "../icon-picker";
import { DOCUMENTATION_ICON_OPTIONS, documentationDisplayIconOptionByName } from "../../documentation-icons";

export function DocumentationIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <AdminIconPicker
      value={value}
      options={DOCUMENTATION_ICON_OPTIONS}
      selectedOption={documentationDisplayIconOptionByName(value)}
      triggerLabel={(label) => `Выбрать иконку раздела документации: ${label}`}
      listLabel="Иконка раздела документации"
      onChange={onChange}
    />
  );
}

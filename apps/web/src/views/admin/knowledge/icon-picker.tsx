"use client";

import { AdminIconPicker } from "../icon-picker";
import { KNOWLEDGE_ICON_OPTIONS, knowledgeDisplayIconOptionByName } from "../../knowledge/knowledge-icons";

export function KnowledgeIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <AdminIconPicker
      value={value}
      options={KNOWLEDGE_ICON_OPTIONS}
      selectedOption={knowledgeDisplayIconOptionByName(value)}
      triggerLabel={(label) => `Выбрать иконку базы знаний: ${label}`}
      listLabel="Иконка базы знаний"
      onChange={onChange}
    />
  );
}

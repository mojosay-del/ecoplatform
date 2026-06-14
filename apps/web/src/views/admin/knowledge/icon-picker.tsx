"use client";

import { KNOWLEDGE_ICON_OPTIONS } from "../../knowledge-base-icons";

export function KnowledgeIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="knowledge-icon-picker" role="radiogroup" aria-label="Иконка в базе знаний">
      {KNOWLEDGE_ICON_OPTIONS.map(({ name, label, Icon }) => {
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            className={`knowledge-icon-option${selected ? " is-selected" : ""}`}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(name)}
          >
            <span className="knowledge-icon-option-glyph" aria-hidden="true">
              <Icon size={20} strokeWidth={2.1} />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

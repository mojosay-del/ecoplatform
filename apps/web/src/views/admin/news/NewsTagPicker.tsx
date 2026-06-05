"use client";

import { Plus, X } from "lucide-react";
import type { TagSuggestion } from "./types";

type NewsTagPickerProps = {
  tags: string[];
  tagDraft: string;
  tagSuggestions: TagSuggestion[];
  tagSuggestionLabel: string;
  onAddTag: (value: string) => void;
  onRemoveTag: (value: string) => void;
  onTagDraftChange: (value: string) => void;
};

export function NewsTagPicker({
  tags,
  tagDraft,
  tagSuggestions,
  tagSuggestionLabel,
  onAddTag,
  onRemoveTag,
  onTagDraftChange,
}: NewsTagPickerProps) {
  return (
    <div className="form-field tag-field">
      <span>Теги</span>
      <div className="tag-input">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            #{tag}
            <button
              type="button"
              className="tag-chip-remove"
              onClick={() => onRemoveTag(tag)}
              aria-label={`Убрать тег ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="tag-input-field"
          placeholder={tags.length === 0 ? "Новый тег" : "Ещё тег"}
          value={tagDraft}
          onChange={(event) => onTagDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " " || event.key === ",") {
              event.preventDefault();
              onAddTag(tagDraft);
              return;
            }
            if (event.key === "Backspace" && tagDraft.length === 0 && tags.length > 0) {
              event.preventDefault();
              onRemoveTag(tags[tags.length - 1]!);
            }
          }}
        />
      </div>
      {tagSuggestions.length > 0 ? (
        <div className="tag-suggestions">
          <span className="tag-suggestions-label">{tagSuggestionLabel}</span>
          {tagSuggestions.map((suggestion) => (
            <button
              className="tag-suggestion"
              key={suggestion.name}
              type="button"
              onClick={() => onAddTag(suggestion.name)}
            >
              <Plus size={11} /> #{suggestion.name}
              {suggestion.usageCount ? <span className="tag-suggestion-count">{suggestion.usageCount}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

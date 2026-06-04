import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import type { NewsTagSummary } from "@ecoplatform/shared";
import { filterNewsTagOptions } from "../news-tag-filters";

export function NewsTagFilters({
  isAllTagsOpen,
  isLoading,
  onClear,
  onToggleDropdown,
  onToggleTag,
  selectedTags,
  tagOptions,
}: {
  isAllTagsOpen: boolean;
  isLoading: boolean;
  onClear: () => void;
  onToggleDropdown: () => void;
  onToggleTag: (tag: string) => void;
  selectedTags: string[];
  tagOptions: NewsTagSummary[];
}) {
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    if (!isAllTagsOpen) {
      setTagSearch("");
    }
  }, [isAllTagsOpen]);

  const hasDropdown = tagOptions.length > 0;
  const filteredTagOptions = useMemo(() => filterNewsTagOptions(tagOptions, tagSearch), [tagOptions, tagSearch]);
  const selectedCount = selectedTags.length;

  if (!isLoading && tagOptions.length === 0 && selectedCount === 0) return null;

  return (
    <nav className="news-tags" aria-label="Фильтр новостей по тегам">
      {isLoading ? <span className="news-tags-loading">Теги загружаются…</span> : null}

      <div className="news-tags-actions">
        {selectedTags.length > 0 ? (
          <button className="news-tags-clear" onClick={onClear} type="button">
            <X aria-hidden="true" size={14} />
            Сбросить
          </button>
        ) : null}
        {hasDropdown ? (
          <button aria-expanded={isAllTagsOpen} className="news-tags-more" onClick={onToggleDropdown} type="button">
            Все теги
            {selectedCount > 0 ? <span className="news-tags-count">{selectedCount}</span> : null}
            <ChevronDown aria-hidden="true" className={isAllTagsOpen ? "is-open" : ""} size={15} />
          </button>
        ) : null}
      </div>

      {hasDropdown && isAllTagsOpen ? (
        <div className="news-tags-dropdown">
          <label className="news-tags-search">
            <Search aria-hidden="true" size={16} />
            <input
              autoComplete="off"
              inputMode="search"
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="Найти тег"
              type="search"
              value={tagSearch}
            />
          </label>
          <div className="news-tags-dropdown-list">
            {filteredTagOptions.length > 0 ? (
              filteredTagOptions.map((tag) => {
                const isActive = selectedTags.includes(tag.name);
                return (
                  <button
                    aria-pressed={isActive}
                    className={`news-tag-dropdown-item ${isActive ? "is-active" : ""}`}
                    key={tag.id}
                    onClick={() => onToggleTag(tag.name)}
                    type="button"
                  >
                    <span>{tag.name}</span>
                    <strong>{tag.usageCount}</strong>
                  </button>
                );
              })
            ) : (
              <p className="news-tags-empty">Такого тега пока нет.</p>
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

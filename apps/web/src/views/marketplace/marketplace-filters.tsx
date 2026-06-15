"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { materialColor } from "./materials";
import {
  type FilterPopover,
  type NomenclatureGroup,
  type SortMode,
  type SortOption,
  groupSelectionState,
  toggle,
  toggleNomenclatureGroup,
} from "./marketplace-feed";

type MarketplaceFilterBarProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  nomenclatureGroups: NomenclatureGroup[];
  selectedNomenclature: string[];
  setSelectedNomenclature: Dispatch<SetStateAction<string[]>>;
  regions: string[];
  selectedRegions: string[];
  setSelectedRegions: Dispatch<SetStateAction<string[]>>;
  sortBy: SortMode;
  setSortBy: Dispatch<SetStateAction<SortMode>>;
  openPopover: FilterPopover | null;
  setOpenPopover: Dispatch<SetStateAction<FilterPopover | null>>;
  sortOptions: SortOption[];
  selectedSort: SortOption;
};

type ActiveFiltersProps = {
  nomenclatureGroups: NomenclatureGroup[];
  selectedNomenclature: string[];
  setSelectedNomenclature: Dispatch<SetStateAction<string[]>>;
  selectedRegions: string[];
  setSelectedRegions: Dispatch<SetStateAction<string[]>>;
  mapBbox: string | null;
  onClearMapBbox: () => void;
  onResetFilters: () => void;
};

export function useMarketplaceFilterDismiss(
  filtersRef: RefObject<HTMLDivElement | null>,
  setOpenPopover: Dispatch<SetStateAction<FilterPopover | null>>,
) {
  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPopover(null);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersRef, setOpenPopover]);
}

export function MarketplaceFilterBar({
  containerRef,
  nomenclatureGroups,
  selectedNomenclature,
  setSelectedNomenclature,
  regions,
  selectedRegions,
  setSelectedRegions,
  sortBy,
  setSortBy,
  openPopover,
  setOpenPopover,
  sortOptions,
  selectedSort,
}: MarketplaceFilterBarProps) {
  return (
    <div className="mp-filterbar" ref={containerRef}>
      {/* Чипы категорий сырья — те же цвета, что круги на карте. */}
      <div aria-label="Категории сырья" className="mp-material-chips" role="group">
        {nomenclatureGroups.map((group) => {
          const state = groupSelectionState(group, selectedNomenclature);
          const color = materialColor(group.slug);
          const selectedCount = group.options.filter((option) => selectedNomenclature.includes(option.id)).length;
          return (
            <button
              aria-pressed={state !== "none"}
              className={`mp-material-chip${state === "all" ? " is-active" : ""}${
                state === "partial" ? " is-partial" : ""
              }`}
              key={group.slug}
              style={state !== "none" ? { borderColor: color, color, backgroundColor: `${color}14` } : undefined}
              type="button"
              onClick={() => setSelectedNomenclature((prev) => toggleNomenclatureGroup(prev, group))}
            >
              <i aria-hidden="true" className="mp-material-dot" style={{ backgroundColor: color }} />
              {group.name}
              {state === "partial" ? (
                <span className="mp-material-chip-count" style={{ backgroundColor: color }}>
                  {selectedCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mp-filterbar-group">
        <div className={`mp-filter-popover${openPopover === "nomenclature" ? " is-open" : ""}`}>
          <button
            aria-controls="marketplace-nomenclature-popover"
            aria-expanded={openPopover === "nomenclature"}
            className="mp-filter-trigger"
            type="button"
            onClick={() => setOpenPopover((value) => (value === "nomenclature" ? null : "nomenclature"))}
          >
            <span>Точнее</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          {openPopover === "nomenclature" ? (
            <div className="mp-filter-menu mp-filter-menu-grouped" id="marketplace-nomenclature-popover">
              {nomenclatureGroups.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
              {nomenclatureGroups.map((group) => (
                <div className="mp-filter-group" key={group.slug}>
                  <div className="mp-filter-group-title">
                    <i
                      aria-hidden="true"
                      className="mp-material-dot"
                      style={{ backgroundColor: materialColor(group.slug) }}
                    />
                    {group.name}
                  </div>
                  {group.options.map((option) => (
                    <label className="mp-filter-option" key={option.id}>
                      <input
                        type="checkbox"
                        checked={selectedNomenclature.includes(option.id)}
                        onChange={() => setSelectedNomenclature((prev) => toggle(prev, option.id))}
                      />
                      <span>{option.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className={`mp-filter-popover${openPopover === "region" ? " is-open" : ""}`}>
          <button
            aria-controls="marketplace-region-popover"
            aria-expanded={openPopover === "region"}
            className="mp-filter-trigger"
            type="button"
            onClick={() => setOpenPopover((value) => (value === "region" ? null : "region"))}
          >
            <span>Регион{selectedRegions.length ? ` · ${selectedRegions.length}` : ""}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          {openPopover === "region" ? (
            <div className="mp-filter-menu" id="marketplace-region-popover">
              {regions.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
              {regions.map((region) => (
                <label className="mp-filter-option" key={region}>
                  <input
                    type="checkbox"
                    checked={selectedRegions.includes(region)}
                    onChange={() => setSelectedRegions((prev) => toggle(prev, region))}
                  />
                  <span>{region}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mp-filter-popover mp-filter-popover-sort${openPopover === "sort" ? " is-open" : ""}`}>
        <button
          aria-controls="marketplace-sort-popover"
          aria-expanded={openPopover === "sort"}
          className="mp-filter-trigger"
          type="button"
          onClick={() => setOpenPopover((value) => (value === "sort" ? null : "sort"))}
        >
          <span>{selectedSort.label}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        {openPopover === "sort" ? (
          <div className="mp-filter-menu mp-sort-menu" id="marketplace-sort-popover">
            {sortOptions.map((option) => (
              <button
                className={`mp-sort-option${sortBy === option.value ? " is-active" : ""}`}
                key={option.value}
                type="button"
                onClick={() => {
                  setSortBy(option.value);
                  setOpenPopover(null);
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {sortBy === option.value ? <Check aria-hidden="true" size={16} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MarketplaceActiveFilters({
  nomenclatureGroups,
  selectedNomenclature,
  setSelectedNomenclature,
  selectedRegions,
  setSelectedRegions,
  mapBbox,
  onClearMapBbox,
  onResetFilters,
}: ActiveFiltersProps) {
  return (
    <div className="mp-active-filters">
      {nomenclatureGroups.flatMap((group) => {
        const state = groupSelectionState(group, selectedNomenclature);
        if (state === "none") return [];
        const color = materialColor(group.slug);
        if (state === "all") {
          return [
            <button
              aria-label={`Убрать фильтр ${group.name}`}
              className="mp-active-chip"
              key={`group:${group.slug}`}
              type="button"
              onClick={() => setSelectedNomenclature((prev) => toggleNomenclatureGroup(prev, group))}
            >
              <i aria-hidden="true" className="mp-material-dot" style={{ backgroundColor: color }} />
              {group.name}
              <X aria-hidden="true" size={14} />
            </button>,
          ];
        }
        return group.options
          .filter((option) => selectedNomenclature.includes(option.id))
          .map((option) => (
            <button
              aria-label={`Убрать фильтр ${option.name}`}
              className="mp-active-chip"
              key={`nom:${option.id}`}
              type="button"
              onClick={() => setSelectedNomenclature((prev) => toggle(prev, option.id))}
            >
              <i aria-hidden="true" className="mp-material-dot" style={{ backgroundColor: color }} />
              {option.name}
              <X aria-hidden="true" size={14} />
            </button>
          ));
      })}
      {selectedRegions.map((region) => (
        <button
          aria-label={`Убрать регион ${region}`}
          className="mp-active-chip"
          key={`region:${region}`}
          type="button"
          onClick={() => setSelectedRegions((prev) => toggle(prev, region))}
        >
          {region}
          <X aria-hidden="true" size={14} />
        </button>
      ))}
      {mapBbox ? (
        <button
          aria-label="Убрать фильтр по области карты"
          className="mp-active-chip"
          type="button"
          onClick={onClearMapBbox}
        >
          Область карты
          <X aria-hidden="true" size={14} />
        </button>
      ) : null}
      <button className="mp-active-clear" type="button" onClick={onResetFilters}>
        Сбросить всё
      </button>
    </div>
  );
}

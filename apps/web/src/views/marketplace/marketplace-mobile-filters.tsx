"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronRight, List, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { api } from "../../lib/api";
import { materialColor } from "./materials";
import {
  DEFAULT_SORT_OPTION,
  type NomenclatureGroup,
  type SortMode,
  type SortOption,
  groupSelectionState,
  toggle,
  toggleNomenclatureGroup,
} from "./marketplace-feed";

type MobileFilterScreen = "main" | "category" | "nomenclature" | "region" | "sort";

type MarketplaceMobileFiltersProps = {
  nomenclatureGroups: NomenclatureGroup[];
  selectedNomenclature: string[];
  setSelectedNomenclature: Dispatch<SetStateAction<string[]>>;
  regions: string[];
  selectedRegions: string[];
  setSelectedRegions: Dispatch<SetStateAction<string[]>>;
  sortBy: SortMode;
  setSortBy: Dispatch<SetStateAction<SortMode>>;
  sortOptions: SortOption[];
  selectedSort: SortOption;
  mapBbox: string | null;
  setMapBbox: Dispatch<SetStateAction<string | null>>;
  mobileView: "list" | "map";
  setMobileView: Dispatch<SetStateAction<"list" | "map">>;
  total: number;
};

function countNoun(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return "объявление";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "объявления";
  return "объявлений";
}

function showButtonLabel(total: number): string {
  return `Показать ${total.toLocaleString("ru-RU")} ${countNoun(total)}`;
}

function categoryCount(groups: NomenclatureGroup[], selected: string[]): number {
  return groups.filter((group) => groupSelectionState(group, selected) !== "none").length;
}

function activeFilterCount(
  selectedNomenclature: string[],
  selectedRegions: string[],
  sortBy: SortMode,
  mapBbox: string | null,
): number {
  return (
    selectedNomenclature.length +
    selectedRegions.length +
    (sortBy !== DEFAULT_SORT_OPTION.value ? 1 : 0) +
    (mapBbox ? 1 : 0)
  );
}

function categorySummary(groups: NomenclatureGroup[], selected: string[]): string {
  const count = categoryCount(groups, selected);
  if (!count) return "Все категории";
  if (count === 1) {
    return groups.find((group) => groupSelectionState(group, selected) !== "none")?.name ?? "1 категория";
  }
  return `${count} категории`;
}

function nomenclatureSummary(selected: string[]): string {
  if (!selected.length) return "Любое сырьё";
  return `${selected.length} выбрано`;
}

function regionSummary(selected: string[], mapBbox: string | null): string {
  if (selected.length === 0 && !mapBbox) return "Все регионы";
  const parts = [];
  if (selected.length === 1) parts.push(selected[0]);
  if (selected.length > 1) parts.push(`${selected.length} региона`);
  if (mapBbox) parts.push("область карты");
  return parts.join(", ");
}

function screenTitle(screen: MobileFilterScreen): string {
  if (screen === "category") return "Категории";
  if (screen === "nomenclature") return "Сырьё";
  if (screen === "region") return "Где искать";
  if (screen === "sort") return "Сортировка";
  return "Фильтры";
}

export function MarketplaceMobileFilters({
  nomenclatureGroups,
  selectedNomenclature,
  setSelectedNomenclature,
  regions,
  selectedRegions,
  setSelectedRegions,
  sortBy,
  setSortBy,
  sortOptions,
  selectedSort,
  mapBbox,
  setMapBbox,
  mobileView,
  setMobileView,
  total,
}: MarketplaceMobileFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [screen, setScreen] = useState<MobileFilterScreen>("main");
  const [draftNomenclature, setDraftNomenclature] = useState<string[]>(selectedNomenclature);
  const [draftRegions, setDraftRegions] = useState<string[]>(selectedRegions);
  const [draftSortBy, setDraftSortBy] = useState<SortMode>(sortBy);
  const [draftMapBbox, setDraftMapBbox] = useState<string | null>(mapBbox);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [previewTotal, setPreviewTotal] = useState(total);

  const activeCount = activeFilterCount(selectedNomenclature, selectedRegions, sortBy, mapBbox);
  const selectedCategoryCount = categoryCount(
    selectedNomenclature.length ? nomenclatureGroups : [],
    selectedNomenclature,
  );
  const selectedDraftSort = sortOptions.find((option) => option.value === draftSortBy) ?? DEFAULT_SORT_OPTION;

  useEffect(() => {
    if (!isOpen) return;
    setScreen("main");
    setDraftNomenclature(selectedNomenclature);
    setDraftRegions(selectedRegions);
    setDraftSortBy(sortBy);
    setDraftMapBbox(mapBbox);
  }, [isOpen, mapBbox, selectedNomenclature, selectedRegions, sortBy]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPreviewTotal(total);
      return;
    }

    let cancelled = false;
    void api.marketplace
      .listings({
        region: draftRegions,
        nomenclatureId: draftNomenclature,
        bbox: draftMapBbox ?? undefined,
        limit: 1,
        offset: 0,
      })
      .then((page) => {
        if (!cancelled) setPreviewTotal(page.total);
      })
      .catch(() => {
        if (!cancelled) setPreviewTotal(total);
      });

    return () => {
      cancelled = true;
    };
  }, [draftMapBbox, draftNomenclature, draftRegions, isOpen, total]);

  function resetDraft() {
    setDraftNomenclature([]);
    setDraftRegions([]);
    setDraftSortBy(DEFAULT_SORT_OPTION.value);
    setDraftMapBbox(null);
  }

  function applyDraft() {
    setSelectedNomenclature(draftNomenclature);
    setSelectedRegions(draftRegions);
    setSortBy(draftSortBy);
    setMapBbox(draftMapBbox);
    setIsOpen(false);
  }

  return (
    <div className="mp-mobile-filters">
      <div className="mp-mobile-filter-rail" aria-label="Быстрые фильтры">
        <button
          aria-label={mobileView === "list" ? "Показать карту" : "Показать список"}
          className="mp-mobile-filter-chip mp-mobile-view-chip"
          type="button"
          onClick={() => setMobileView((current) => (current === "list" ? "map" : "list"))}
        >
          {mobileView === "list" ? <MapIcon aria-hidden="true" size={16} /> : <List aria-hidden="true" size={16} />}
          <span>{mobileView === "list" ? "Карта" : "Список"}</span>
        </button>
        <button className="mp-mobile-filter-chip mp-mobile-filter-open" type="button" onClick={() => setIsOpen(true)}>
          <SlidersHorizontal aria-hidden="true" size={16} />
          <span>Фильтры</span>
          {activeCount ? <span className="mp-mobile-filter-count">{activeCount}</span> : null}
        </button>
        <button className="mp-mobile-filter-chip" type="button" onClick={() => setIsOpen(true)}>
          Категории{selectedCategoryCount ? ` · ${selectedCategoryCount}` : ""}
        </button>
        <button
          className={`mp-mobile-filter-chip${selectedNomenclature.length ? " is-active" : ""}`}
          type="button"
          onClick={() => setIsOpen(true)}
        >
          Сырьё{selectedNomenclature.length ? ` · ${selectedNomenclature.length}` : ""}
        </button>
        <button
          className={`mp-mobile-filter-chip${selectedRegions.length || mapBbox ? " is-active" : ""}`}
          type="button"
          onClick={() => setIsOpen(true)}
        >
          {mapBbox && selectedRegions.length === 0
            ? "Область карты"
            : selectedRegions.length === 1
              ? selectedRegions[0]
              : `Регион${selectedRegions.length ? ` · ${selectedRegions.length}` : ""}`}
        </button>
        <button
          className={`mp-mobile-filter-chip${sortBy !== DEFAULT_SORT_OPTION.value ? " is-active" : ""}`}
          type="button"
          onClick={() => setIsOpen(true)}
        >
          {selectedSort.label}
        </button>
      </div>

      {isOpen && portalRoot
        ? createPortal(
            <div
              className="mp-mobile-filter-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mp-mobile-filter-title"
            >
              <div className="mp-mobile-filter-header">
                {screen === "main" ? (
                  <button
                    aria-label="Закрыть фильтры"
                    className="mp-mobile-filter-icon"
                    type="button"
                    onClick={() => setIsOpen(false)}
                  >
                    <X aria-hidden="true" size={22} />
                  </button>
                ) : (
                  <button
                    aria-label="Назад к фильтрам"
                    className="mp-mobile-filter-icon"
                    type="button"
                    onClick={() => setScreen("main")}
                  >
                    <ArrowLeft aria-hidden="true" size={22} />
                  </button>
                )}
                <strong id="mp-mobile-filter-title">{screenTitle(screen)}</strong>
                <button className="mp-mobile-filter-reset" type="button" onClick={resetDraft}>
                  Сбросить
                </button>
              </div>

              <div className="mp-mobile-filter-body">
                {screen === "main" ? (
                  <div className="mp-mobile-filter-main">
                    <section className="mp-mobile-filter-section">
                      <h3>Что сдаём</h3>
                      <MobileFilterRow
                        label="Категории"
                        value={categorySummary(nomenclatureGroups, draftNomenclature)}
                        onClick={() => setScreen("category")}
                      />
                      <MobileFilterRow
                        label="Сырьё"
                        value={nomenclatureSummary(draftNomenclature)}
                        onClick={() => setScreen("nomenclature")}
                      />
                    </section>
                    <section className="mp-mobile-filter-section">
                      <h3>Где искать</h3>
                      <MobileFilterRow
                        label="Регион"
                        value={regionSummary(draftRegions, draftMapBbox)}
                        onClick={() => setScreen("region")}
                      />
                    </section>
                    <section className="mp-mobile-filter-section">
                      <h3>Сортировка</h3>
                      <MobileFilterRow
                        label="Порядок"
                        value={selectedDraftSort.label}
                        onClick={() => setScreen("sort")}
                      />
                    </section>
                  </div>
                ) : null}

                {screen === "category" ? (
                  <div className="mp-mobile-filter-options">
                    {nomenclatureGroups.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
                    {nomenclatureGroups.map((group) => {
                      const state = groupSelectionState(group, draftNomenclature);
                      const color = materialColor(group.slug);
                      const selectedCount = group.options.filter((option) =>
                        draftNomenclature.includes(option.id),
                      ).length;
                      return (
                        <button
                          aria-pressed={state !== "none"}
                          className={`mp-mobile-filter-option${state !== "none" ? " is-active" : ""}`}
                          key={group.slug}
                          type="button"
                          onClick={() => setDraftNomenclature((prev) => toggleNomenclatureGroup(prev, group))}
                        >
                          <i aria-hidden="true" className="mp-material-dot" style={{ backgroundColor: color }} />
                          <span>{group.name}</span>
                          {state === "partial" ? (
                            <span className="mp-material-chip-count" style={{ backgroundColor: color }}>
                              {selectedCount}
                            </span>
                          ) : null}
                          {state === "all" ? <Check aria-hidden="true" size={16} /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {screen === "nomenclature" ? (
                  <div className="mp-mobile-filter-groups">
                    {nomenclatureGroups.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
                    {nomenclatureGroups.map((group) => (
                      <section className="mp-mobile-filter-option-group" key={group.slug}>
                        <h3>
                          <i
                            aria-hidden="true"
                            className="mp-material-dot"
                            style={{ backgroundColor: materialColor(group.slug) }}
                          />
                          {group.name}
                        </h3>
                        {group.options.map((option) => (
                          <label className="mp-mobile-filter-check" key={option.id}>
                            <input
                              type="checkbox"
                              checked={draftNomenclature.includes(option.id)}
                              onChange={() => setDraftNomenclature((prev) => toggle(prev, option.id))}
                            />
                            <span>{option.name}</span>
                          </label>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : null}

                {screen === "region" ? (
                  <div className="mp-mobile-filter-options">
                    {draftMapBbox ? (
                      <button
                        className="mp-mobile-filter-option is-active"
                        type="button"
                        onClick={() => setDraftMapBbox(null)}
                      >
                        <span>Область карты</span>
                        <X aria-hidden="true" size={16} />
                      </button>
                    ) : null}
                    {regions.length === 0 ? <span className="mp-filter-empty">Нет данных</span> : null}
                    {regions.map((region) => (
                      <label className="mp-mobile-filter-check" key={region}>
                        <input
                          type="checkbox"
                          checked={draftRegions.includes(region)}
                          onChange={() => setDraftRegions((prev) => toggle(prev, region))}
                        />
                        <span>{region}</span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {screen === "sort" ? (
                  <div className="mp-mobile-filter-options">
                    {sortOptions.map((option) => (
                      <button
                        className={`mp-mobile-filter-sort${draftSortBy === option.value ? " is-active" : ""}`}
                        key={option.value}
                        type="button"
                        onClick={() => setDraftSortBy(option.value)}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        {draftSortBy === option.value ? <Check aria-hidden="true" size={17} /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mp-mobile-filter-footer">
                <button className="mp-mobile-filter-apply" type="button" onClick={applyDraft}>
                  {showButtonLabel(previewTotal)}
                </button>
              </div>
            </div>,
            portalRoot,
          )
        : null}
    </div>
  );
}

function MobileFilterRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button className="mp-mobile-filter-row" type="button" onClick={onClick}>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
      <ChevronRight aria-hidden="true" size={19} />
    </button>
  );
}

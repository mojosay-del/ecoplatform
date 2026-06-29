"use client";

// Презентационные примитивы формы объявления: доступный кастомный селект
// (FormSelect), мультивыбор упаковки (PackagingSelect), плитка фото с drag&drop
// (SortableMediaTile) и заголовок секции. Состояние формы — в use-listing-form.ts.

import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, GripVertical, Layers, X, type LucideIcon } from "lucide-react";
import { NO_PACKAGING, PACKAGING_OPTIONS, type MediaItem, type SelectOption } from "./listing-form.helpers";

export function sectionTitle(Icon: LucideIcon, title: string) {
  return (
    <h2>
      <span className="mp-section-icon">
        <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
      </span>
      {title}
    </h2>
  );
}

export function SortableMediaTile({
  item,
  index,
  url,
  onRemove,
}: {
  item: MediaItem;
  index: number;
  url: string | null;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.fileId,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.72 : 1,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mp-media-tile mp-photo-tile${index === 0 ? " is-primary" : ""}${isDragging ? " is-dragging" : ""}`}
    >
      {url ? <img src={url} alt="" /> : <div className="mp-media-empty">Фото</div>}
      {index === 0 ? <span className="mp-media-primary-badge">Главное фото</span> : null}
      <button
        className="mp-media-drag-handle"
        type="button"
        aria-label={`Перетащить фото ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <button className="mp-media-remove" type="button" aria-label="Удалить фото" onClick={onRemove}>
        <X size={14} />
      </button>
    </div>
  );
}

export function FormSelect({
  icon: Icon,
  label,
  value,
  placeholder = "Выберите",
  options,
  disabled = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(activeIndex);
        else setOpen(true);
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`mp-form-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        className="mp-form-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <Icon className="mp-form-select-leading" size={17} strokeWidth={2.1} aria-hidden="true" />
        <span className={selected ? "" : "mp-form-select-placeholder"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="mp-form-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mp-form-select-list" role="listbox" id={listboxId} aria-label={label}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- выбор мышью; клавиатура — через onKeyDown триггера (combobox)
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`mp-form-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function PackagingSelect({ value, onToggle }: { value: string[]; onToggle: (option: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const label = value.join(", ") || NO_PACKAGING;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(index: number) {
    const option = PACKAGING_OPTIONS[index];
    if (!option) return;
    onToggle(option);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.min(PACKAGING_OPTIONS.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) toggle(activeIndex);
        else setOpen(true);
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`mp-form-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="mp-form-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label="Упаковка"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <Layers className="mp-form-select-leading" size={17} strokeWidth={2.1} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown className="mp-form-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mp-form-select-list" role="listbox" id={listboxId} aria-label="Упаковка" aria-multiselectable>
          {PACKAGING_OPTIONS.map((option, index) => {
            const isSelected = value.includes(option);
            const isActive = index === activeIndex;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- выбор мышью; клавиатура — через onKeyDown триггера (combobox)
              <li
                key={option}
                role="option"
                aria-selected={isSelected}
                className={`mp-form-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => toggle(index)}
              >
                <span>{option}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

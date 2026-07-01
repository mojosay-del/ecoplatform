"use client";

// Нейтральный поповер-селект (как в регистрации, но без auth-привязки): триггер —
// обычное поле, список открывается анимированным поповером с клавиатурой
// (стрелки, Enter, Esc, Home/End) и role="listbox". Управляется value/onChange
// (без скрытого input). Классы ui-select-* — общий web-примитив.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import "./popover-select.css";

export type PopoverSelectOption = { value: string; label: string };

export function PopoverSelect({
  icon: Icon,
  value,
  options,
  onChange,
  label,
  labelId,
  className,
}: {
  icon?: LucideIcon;
  value: string;
  options: PopoverSelectOption[];
  onChange: (value: string) => void;
  label: string;
  // Если рядом есть видимый <label>, передаём его id (aria-labelledby).
  labelId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const indexOfValue = () => {
    const found = options.findIndex((option) => option.value === value);
    return found === -1 ? 0 : found;
  };
  const [activeIndex, setActiveIndex] = useState(indexOfValue);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

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
    if (open) setActiveIndex(indexOfValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
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
  };

  return (
    <div className={`ui-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`ui-select-trigger${Icon ? " has-icon" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        {...(labelId ? { "aria-labelledby": labelId } : { "aria-label": label })}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        {Icon ? <Icon className="ui-select-icon" size={17} strokeWidth={2} aria-hidden="true" /> : null}
        <span className="ui-select-value">{selected?.label}</span>
        <ChevronDown className="ui-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="ui-select-list" role="listbox" id={listboxId} ref={listRef} tabIndex={-1}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- выбор мышью; клавиатура — через onKeyDown триггера (combobox)
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={isSelected}
                className={`ui-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="ui-select-option-label">{option.label}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

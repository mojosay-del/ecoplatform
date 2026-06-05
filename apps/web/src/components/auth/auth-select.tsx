"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

type AuthSelectOption = { value: string; label: string };

/**
 * Кастомный выпадающий список в стиле auth-полей: триггер выглядит как обычное
 * поле с ведущей иконкой, а список открывается анимированным поповером.
 * Управляется с клавиатуры (стрелки, Enter, Esc, Home/End) и доступен для
 * скринридеров через role="listbox". Скрытый input сохраняет нативную
 * семантику формы (name/value).
 */
export function AuthSelect({
  icon: Icon,
  name,
  value,
  options,
  onChange,
  label,
}: {
  icon: LucideIcon;
  name: string;
  value: string;
  options: AuthSelectOption[];
  onChange: (value: string) => void;
  label: string;
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
    <div className={`auth-select${open ? " is-open" : ""}`} ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="auth-select-trigger auth-input-leading"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
      >
        <Icon className="auth-field-affix-icon" size={17} strokeWidth={2} aria-hidden="true" />
        <span className="auth-select-value">{selected?.label}</span>
        <ChevronDown className="auth-select-chevron" size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="auth-select-list" role="listbox" id={listboxId} ref={listRef} tabIndex={-1}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`auth-select-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="auth-select-option-label">{option.label}</span>
                {isSelected ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

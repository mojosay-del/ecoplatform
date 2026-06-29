"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export type AdminIconOption = {
  name: string;
  label: string;
  Icon: LucideIcon;
};

export function AdminIconPicker({
  value,
  options,
  selectedOption,
  triggerLabel,
  listLabel,
  onChange,
}: {
  value: string;
  options: AdminIconOption[];
  selectedOption: AdminIconOption;
  triggerLabel: (label: string) => string;
  listLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.name === selectedOption.name),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = useId();
  const SelectedIcon = selectedOption.Icon;

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;

    const updatePosition = () => {
      Object.assign(list.style, { width: `${trigger.getBoundingClientRect().width}px` });
      void computePosition(trigger, list, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(list.style, { left: `${x}px`, top: `${y}px` });
      });
    };

    updatePosition();
    const cleanup = autoUpdate(trigger, list, updatePosition);
    return cleanup;
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.children.item(activeIndex);
    option?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.name);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
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
  }

  return (
    <div className={`knowledge-icon-picker${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="knowledge-icon-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${listboxId}-${options[activeIndex]?.name}` : undefined}
        aria-label={triggerLabel(selectedOption.label)}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
      >
        <span className="knowledge-icon-trigger-glyph" aria-hidden="true">
          <SelectedIcon size={20} strokeWidth={2.1} />
        </span>
        <span className="knowledge-icon-trigger-label">{selectedOption.label}</span>
        <ChevronDown className="knowledge-icon-trigger-chevron" size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open ? (
        <ul
          className="knowledge-icon-list"
          role="listbox"
          id={listboxId}
          ref={listRef}
          tabIndex={-1}
          aria-label={listLabel}
        >
          {options.map(({ name, label, Icon }, index) => {
            const isSelected = value === name;
            const isActive = index === activeIndex;
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- выбор мышью; клавиатура — через onKeyDown триггера (combobox)
              <li
                key={name}
                id={`${listboxId}-${name}`}
                className={`knowledge-icon-option${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span className="knowledge-icon-option-glyph" aria-hidden="true">
                  <Icon size={20} strokeWidth={2.1} />
                </span>
                <span className="knowledge-icon-option-label">{label}</span>
                {isSelected ? (
                  <Check className="knowledge-icon-option-check" size={16} strokeWidth={2.6} aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

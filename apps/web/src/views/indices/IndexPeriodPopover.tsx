"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { INDEX_PERIOD_LABELS } from "./constants";
import type { IndexPeriod } from "./types";

type IndexPeriodPopoverProps = {
  ariaLabel: string;
  className?: string;
  onChange: (period: IndexPeriod) => void;
  period: IndexPeriod;
};

const INDEX_PERIOD_VALUES = Object.keys(INDEX_PERIOD_LABELS) as IndexPeriod[];

export function IndexPeriodPopover({ ariaLabel, className, onChange, period }: IndexPeriodPopoverProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const classes = ["index-period-popover", className, open ? "is-open" : ""].filter(Boolean).join(" ");

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(value: IndexPeriod) {
    if (value !== period) onChange(value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    setOpen(true);
  }

  return (
    <div className={classes} ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}: ${INDEX_PERIOD_LABELS[period]}`}
        className="index-period-popover-trigger"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={openFromKeyboard}
        ref={triggerRef}
        type="button"
      >
        <span>{INDEX_PERIOD_LABELS[period]}</span>
        <ChevronDown aria-hidden="true" size={16} strokeWidth={2.2} />
      </button>

      {open ? (
        <div className="index-period-popover-menu" id={menuId} role="listbox" aria-label={ariaLabel}>
          {INDEX_PERIOD_VALUES.map((value) => (
            <button
              aria-selected={value === period}
              className={`index-period-popover-option ${value === period ? "is-selected" : ""}`}
              key={value}
              onClick={() => choose(value)}
              role="option"
              type="button"
            >
              <span>{INDEX_PERIOD_LABELS[value]}</span>
              {value === period ? <Check aria-hidden="true" size={15} strokeWidth={2.6} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

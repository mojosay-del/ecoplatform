"use client";

// Компактный кастомный календарь-поповер вместо нативного <input type="date">
// (его ОС-календарь выглядит по-разному и неудобен). Отдаёт наружу ISO-дату
// "yyyy-mm-dd" — совместимо с прежним кодом. Позиционирование — через
// @floating-ui/dom (уже используется в slash-command редактора).

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { RU_MONTHS, RU_WEEKDAYS, buildMonthGrid, formatRuDate, parseIsoDate, toIsoDate } from "./date-picker-utils";

export function DatePicker({
  value,
  onChange,
  required,
  ariaLabel = "Дата",
}: {
  value: string;
  onChange: (iso: string) => void;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();

  const today = useMemo(() => new Date(), []);
  const parsed = parseIsoDate(value);
  const [view, setView] = useState(() => ({
    year: parsed?.year ?? today.getFullYear(),
    month: parsed?.month ?? today.getMonth(),
  }));

  // При открытии — показываем месяц выбранной даты (или текущий).
  useEffect(() => {
    if (!open) return;
    const next = parseIsoDate(value);
    setView({ year: next?.year ?? today.getFullYear(), month: next?.month ?? today.getMonth() });
  }, [open, value, today]);

  // Позиционирование поповера + закрытие по клику вне и Escape.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (trigger && popover) {
      void computePosition(trigger, popover, {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(popover.style, { left: `${x}px`, top: `${y}px` });
      });
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view.year, view.month]);
  const todayIso = toIsoDate(today);
  const display = formatRuDate(value);

  function shiftMonth(delta: number) {
    setView((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function selectDay(iso: string) {
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="date-picker">
      <button
        type="button"
        ref={triggerRef}
        className={`input date-picker-trigger${display ? "" : " is-placeholder"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Calendar size={16} aria-hidden />
        <span>{display || "дд.мм.гггг"}</span>
      </button>
      {/* Скрытый required-инпут: форма не отправится без выбранной даты. */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="date-picker-required"
          required
          value={value}
          onChange={() => undefined}
        />
      ) : null}

      {open ? (
        <div
          ref={popoverRef}
          className="date-picker-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
        >
          <div className="date-picker-head">
            <button
              type="button"
              className="date-picker-nav"
              aria-label="Предыдущий месяц"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="date-picker-title" id={labelId}>
              {RU_MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              className="date-picker-nav"
              aria-label="Следующий месяц"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden>
            {RU_WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="date-picker-grid">
            {grid.map((cell) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  type="button"
                  key={cell.iso}
                  className={`date-picker-day${cell.inMonth ? "" : " is-outside"}${isSelected ? " is-selected" : ""}${
                    isToday ? " is-today" : ""
                  }`}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  onClick={() => selectDay(cell.iso)}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

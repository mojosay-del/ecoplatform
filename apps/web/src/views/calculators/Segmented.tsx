"use client";

type SegmentedProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
};

// Компактный переключатель (база процента «маржи/выручки» и т.п.).
export function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <span className="tc-segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`tc-segmented-option${value === option.value ? " is-active" : ""}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

"use client";

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  type?: "number" | "text";
};

// Числовое/текстовое поле с подписью и единицей. Числовой режим: decimal-клава
// на телефоне, скрытые спиннеры (см. calculators.css), крупный шрифт.
export function Field({ label, value, onChange, unit, type = "number" }: FieldProps) {
  return (
    <label className="tc-field">
      <span className="tc-field-label">{label}</span>
      <span className="tc-field-control">
        <input
          className="tc-field-input"
          type={type}
          inputMode={type === "number" ? "decimal" : "text"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <span className="tc-field-unit">{unit}</span> : null}
      </span>
    </label>
  );
}

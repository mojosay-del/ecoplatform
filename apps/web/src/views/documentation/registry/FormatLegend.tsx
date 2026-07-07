"use client";

// Легенда-фильтр форматов: премиум-пластины (цвет = формат). Активная пластина
// «прижата». Скрывается, если формат в реестре один.

import { formatLabel } from "../documentFormats";
import { fmtStyle } from "../doc-badges";

export function FormatLegend({
  formats,
  active,
  onChange,
}: {
  formats: string[];
  active: string | null;
  onChange: (format: string | null) => void;
}) {
  if (formats.length <= 1) return null;

  return (
    <div className="doc-legend" role="group" aria-label="Фильтр по формату">
      <span className="doc-legend-label">Форматы</span>
      <button
        type="button"
        className={`doc-legend-plate is-all${active === null ? " is-active" : ""}`}
        onClick={() => onChange(null)}
        aria-pressed={active === null}
      >
        Все
      </button>
      {formats.map((format) => (
        <button
          key={format}
          type="button"
          className={`doc-legend-plate${active === format ? " is-active" : ""}`}
          style={fmtStyle(format)}
          onClick={() => onChange(active === format ? null : format)}
          aria-pressed={active === format}
        >
          <span aria-hidden="true" className="doc-legend-plate-dot" />
          {formatLabel(format)}
        </button>
      ))}
    </div>
  );
}

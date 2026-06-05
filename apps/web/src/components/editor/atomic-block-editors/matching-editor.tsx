"use client";

import { Plus, Trash2 } from "lucide-react";
import type { PatchFn } from "./types";
import { str } from "./utils";

type Pair = { left: string; right: string };

export function MatchingEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const pairs: Pair[] =
    (payload.pairs as Pair[])?.map((pair) => ({ left: str(pair?.left), right: str(pair?.right) })) ?? [];

  function setPairs(next: Pair[]) {
    onChange({ pairs: next });
  }
  function setPair(index: number, patch: Partial<Pair>) {
    setPairs(pairs.map((pair, idx) => (idx === index ? { ...pair, ...patch } : pair)));
  }

  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Инструкция (необязательно)"
        value={str(payload.instruction)}
        onChange={(event) => onChange({ instruction: event.target.value })}
      />
      <div className="stack-list">
        {pairs.map((pair, index) => (
          <div className="doc-pair-row" key={index}>
            <input
              className="input"
              placeholder="Слева"
              value={pair.left}
              onChange={(event) => setPair(index, { left: event.target.value })}
            />
            <span className="doc-pair-link" aria-hidden>
              ↔
            </span>
            <input
              className="input"
              placeholder="Справа (верная пара)"
              value={pair.right}
              onChange={(event) => setPair(index, { right: event.target.value })}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setPairs(pairs.filter((_, idx) => idx !== index))}
              disabled={pairs.length <= 2}
              aria-label="Удалить пару"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() => setPairs([...pairs, { left: "", right: "" }])}
        >
          <Plus size={14} /> Добавить пару
        </button>
      </div>
    </div>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import type { PatchFn } from "./types";
import { str } from "./utils";

type QuizOption = { text: string; correct: boolean };

export function QuizEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const multiple = Boolean(payload.multiple);
  const options: QuizOption[] =
    (payload.options as QuizOption[])?.map((option) => ({
      text: str(option?.text),
      correct: Boolean(option?.correct),
    })) ?? [];

  function setOptions(next: QuizOption[]) {
    onChange({ options: next });
  }
  function setOption(index: number, patch: Partial<QuizOption>) {
    setOptions(options.map((option, idx) => (idx === index ? { ...option, ...patch } : option)));
  }
  function chooseCorrect(index: number, value: boolean) {
    if (multiple) {
      setOption(index, { correct: value });
    } else {
      // один правильный: помечаем выбранный, снимаем остальные
      setOptions(options.map((option, idx) => ({ ...option, correct: idx === index })));
    }
  }
  function toggleMultiple(next: boolean) {
    if (!next) {
      // при переходе в «один ответ» оставляем правильным только первый отмеченный
      const firstCorrect = options.findIndex((option) => option.correct);
      onChange({
        multiple: false,
        options: options.map((option, idx) => ({ ...option, correct: idx === firstCorrect })),
      });
    } else {
      onChange({ multiple: true });
    }
  }

  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Текст вопроса"
        value={str(payload.question)}
        onChange={(event) => onChange({ question: event.target.value })}
      />
      <label className="doc-quiz-multiple">
        <input type="checkbox" checked={multiple} onChange={(event) => toggleMultiple(event.target.checked)} />
        Несколько правильных ответов
      </label>

      <div className="stack-list">
        {options.map((option, index) => (
          <div className="doc-quiz-option" key={index}>
            <input
              type={multiple ? "checkbox" : "radio"}
              className="doc-quiz-correct"
              name="quiz-correct"
              checked={option.correct}
              onChange={(event) => chooseCorrect(index, event.target.checked)}
              title="Отметить правильным"
              aria-label="Правильный вариант"
            />
            <input
              className="input"
              placeholder={`Вариант ${index + 1}`}
              value={option.text}
              onChange={(event) => setOption(index, { text: event.target.value })}
              style={{ flex: 1 }}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setOptions(options.filter((_, idx) => idx !== index))}
              disabled={options.length <= 2}
              aria-label="Удалить вариант"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() => setOptions([...options, { text: "", correct: false }])}
        >
          <Plus size={14} /> Добавить вариант
        </button>
      </div>

      <input
        className="input"
        placeholder="Объяснение после ответа (необязательно)"
        value={str(payload.explanation)}
        onChange={(event) => onChange({ explanation: event.target.value })}
      />
    </div>
  );
}

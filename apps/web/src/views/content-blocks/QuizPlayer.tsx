"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";

export type QuizPayload = {
  question: string;
  multiple?: boolean;
  options: Array<{ text: string; correct: boolean }>;
  explanation?: string;
};

export function QuizPlayer({ payload }: { payload: QuizPayload }) {
  const options = payload.options ?? [];
  const multiple = Boolean(payload.multiple);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  function toggle(index: number) {
    setChecked(false);
    setSelected((prev) => {
      if (multiple) return prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      return [index];
    });
  }

  const isCorrect = useMemo(() => {
    const correct = options.map((option, index) => (option.correct ? index : -1)).filter((i) => i >= 0);
    return correct.length === selected.length && correct.every((i) => selected.includes(i));
  }, [options, selected]);

  return (
    <div className="quiz-block">
      <div className="quiz-head">
        <span className="quiz-badge">{multiple ? "Несколько ответов" : "Один ответ"}</span>
      </div>
      <p className="quiz-question">{payload.question}</p>
      <div className="quiz-options" role="group" aria-label="Варианты ответа">
        {options.map((option, index) => {
          const isSelected = selected.includes(index);
          let state = "";
          if (checked) {
            if (option.correct) state = "is-correct";
            else if (isSelected) state = "is-wrong";
          } else if (isSelected) {
            state = "is-selected";
          }
          const showCheck = (checked && option.correct) || (!checked && isSelected);
          const showCross = checked && !option.correct && isSelected;
          return (
            <button
              type="button"
              key={index}
              className={`quiz-option ${state}`}
              onClick={() => toggle(index)}
              aria-pressed={isSelected}
            >
              <span className={`quiz-option-marker${multiple ? " is-multiple" : ""}`} aria-hidden>
                {showCheck ? <Check size={14} strokeWidth={3} /> : showCross ? <X size={14} strokeWidth={3} /> : null}
              </span>
              <span className="quiz-option-text">{option.text}</span>
            </button>
          );
        })}
      </div>
      <div className="quiz-actions">
        <button
          className="button quiz-check"
          type="button"
          disabled={selected.length === 0}
          onClick={() => setChecked(true)}
        >
          Проверить
        </button>
        {checked ? (
          <span className={`quiz-verdict ${isCorrect ? "is-correct" : "is-wrong"}`} role="status">
            <span className="quiz-verdict-icon" aria-hidden>
              {isCorrect ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
            </span>
            {isCorrect ? "Верно!" : "Не совсем — попробуйте ещё раз"}
          </span>
        ) : null}
      </div>
      {checked && payload.explanation ? <p className="quiz-explanation">{payload.explanation}</p> : null}
    </div>
  );
}

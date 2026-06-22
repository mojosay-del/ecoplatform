import { describe, expect, it } from "vitest";
import { parseMatchingPayload, parseQuizPayload } from "./content-block-validation";

describe("content block runtime validation", () => {
  it("accepts a valid quiz payload", () => {
    const result = parseQuizPayload({
      question: "Какой контейнер подходит для бумаги?",
      options: [
        { text: "Синий", correct: true },
        { text: "Зелёный", correct: false },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.multiple).toBe(false);
      expect(result.payload.options).toHaveLength(2);
    }
  });

  it("rejects a quiz payload without a correct answer", () => {
    const result = parseQuizPayload({
      question: "Вопрос",
      options: [
        { text: "A", correct: false },
        { text: "B", correct: false },
      ],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a valid matching payload", () => {
    const result = parseMatchingPayload({
      instruction: "Соедините материал и контейнер",
      pairs: [
        { left: "Бумага", right: "Синий" },
        { left: "Стекло", right: "Зелёный" },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.pairs).toHaveLength(2);
    }
  });

  it("rejects a matching payload with less than two pairs", () => {
    const result = parseMatchingPayload({
      pairs: [{ left: "Бумага", right: "Синий" }],
    });

    expect(result.ok).toBe(false);
  });
});

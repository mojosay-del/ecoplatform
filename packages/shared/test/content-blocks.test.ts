import { describe, expect, it } from "vitest";
import {
  baseContentBlockSchema,
  lessonBlockSchema,
  matchingBlockSchema,
  newsBlockSchema,
  quizBlockSchema,
  validateLessonBlocks,
  validateNewsBlocks,
} from "../src/content-blocks";

describe("video block (Rutube убран)", () => {
  it("требует загруженный файл и принимает подпись", () => {
    expect(baseContentBlockSchema.safeParse({ type: "video", payload: { fileId: "f1" } }).success).toBe(true);
    expect(
      baseContentBlockSchema.safeParse({ type: "video", payload: { fileId: "f1", caption: "Подпись" } }).success,
    ).toBe(true);
  });

  it("отвергает видео без файла (в т.ч. бывшую rutube-ссылку)", () => {
    expect(baseContentBlockSchema.safeParse({ type: "video", payload: {} }).success).toBe(false);
    expect(
      baseContentBlockSchema.safeParse({ type: "video", payload: { rutubeUrl: "https://rutube.ru/video/abc" } })
        .success,
    ).toBe(false);
  });
});

describe("quiz block (тест с выбором ответа)", () => {
  it("принимает один правильный вариант", () => {
    const block = {
      type: "quiz",
      payload: {
        question: "Какой контейнер для бумаги?",
        multiple: false,
        options: [
          { text: "Синий", correct: true },
          { text: "Зелёный", correct: false },
        ],
      },
    };
    expect(quizBlockSchema.safeParse(block).success).toBe(true);
  });

  it("принимает несколько правильных вариантов", () => {
    const block = {
      type: "quiz",
      payload: {
        question: "Что относится к вторсырью?",
        multiple: true,
        options: [
          { text: "Картон", correct: true },
          { text: "ПЭТ", correct: true },
          { text: "Пищевые отходы", correct: false },
        ],
        explanation: "Картон и ПЭТ перерабатываются.",
      },
    };
    expect(quizBlockSchema.safeParse(block).success).toBe(true);
  });

  it("отвергает тест без правильного ответа или с одним вариантом", () => {
    expect(
      quizBlockSchema.safeParse({
        type: "quiz",
        payload: {
          question: "Вопрос",
          options: [
            { text: "A", correct: false },
            { text: "B", correct: false },
          ],
        },
      }).success,
    ).toBe(false);

    expect(
      quizBlockSchema.safeParse({
        type: "quiz",
        payload: { question: "Вопрос", options: [{ text: "A", correct: true }] },
      }).success,
    ).toBe(false);
  });
});

describe("matching block (сопоставление)", () => {
  it("принимает минимум две пары", () => {
    expect(
      matchingBlockSchema.safeParse({
        type: "matching",
        payload: {
          instruction: "Соедините материал и контейнер",
          pairs: [
            { left: "Бумага", right: "Синий" },
            { left: "Стекло", right: "Зелёный" },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("отвергает менее двух пар", () => {
    expect(
      matchingBlockSchema.safeParse({
        type: "matching",
        payload: { pairs: [{ left: "Бумага", right: "Синий" }] },
      }).success,
    ).toBe(false);
  });
});

describe("разделение наборов блоков новости vs урок", () => {
  const quizBlock = {
    type: "quiz",
    payload: {
      question: "Вопрос",
      options: [
        { text: "A", correct: true },
        { text: "B", correct: false },
      ],
    },
  };
  const matchingBlock = {
    type: "matching",
    payload: {
      pairs: [
        { left: "L1", right: "R1" },
        { left: "L2", right: "R2" },
      ],
    },
  };

  it("урок принимает интерактивные блоки", () => {
    expect(lessonBlockSchema.safeParse(quizBlock).success).toBe(true);
    expect(lessonBlockSchema.safeParse(matchingBlock).success).toBe(true);
    expect(validateLessonBlocks([quizBlock, matchingBlock]).ok).toBe(true);
  });

  it("новости НЕ принимают интерактивные блоки", () => {
    expect(newsBlockSchema.safeParse(quizBlock).success).toBe(false);
    expect(newsBlockSchema.safeParse(matchingBlock).success).toBe(false);
    expect(validateNewsBlocks([quizBlock]).ok).toBe(false);
  });

  it("новости по-прежнему принимают обычный текстовый блок", () => {
    expect(validateNewsBlocks([{ type: "paragraph", payload: { html: "<p>Текст</p>" } }]).ok).toBe(true);
  });
});

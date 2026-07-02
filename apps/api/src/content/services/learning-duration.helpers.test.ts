import { describe, expect, it } from "vitest";
import { estimateLessonMinutes, estimateLessonSeconds } from "./learning-duration.helpers";

describe("learning duration estimation", () => {
  it("считает чтение абзаца по словам без тегов и entity", () => {
    // 360 слов при 180 wpm = ровно 2 минуты.
    const words = Array.from({ length: 360 }, (_, index) => `слово${index}`).join(" ");
    const blocks = [{ type: "paragraph", payload: { v: 1, html: `<p onclick="x">${words}</p>&nbsp;` } }];

    expect(estimateLessonSeconds(blocks)).toBeCloseTo(120);
    expect(estimateLessonMinutes(blocks)).toBe(2);
  });

  it("аудио использует durationSeconds, а без него — фолбэк", () => {
    expect(estimateLessonSeconds([{ type: "audio", payload: { fileId: "f", durationSeconds: 240 } }])).toBe(240);
    expect(estimateLessonSeconds([{ type: "audio", payload: { fileId: "f" } }])).toBe(180);
  });

  it("видео без хранимой длительности даёт фиксированные 5 минут", () => {
    expect(estimateLessonSeconds([{ type: "video", payload: { fileId: "f" } }])).toBe(300);
  });

  it("интерактив и списки масштабируются от числа элементов", () => {
    expect(
      estimateLessonSeconds([
        { type: "quiz", payload: { question: "?", options: [{}, {}, {}] } },
        { type: "matching", payload: { pairs: [{}, {}] } },
        { type: "checklist", payload: { items: ["a", "b"] } },
        { type: "lesson_tasks", payload: { tasks: [{}] } },
        { type: "gallery", payload: { images: [{}, {}] } },
      ]),
    ).toBe(45 + 3 * 10 + (30 + 2 * 15) + 2 * 8 + 1 * 60 + 2 * 10);
  });

  it("смешанный урок суммируется и округляется вверх, минимум 1 минута", () => {
    const blocks = [
      { type: "heading", payload: { text: "Заголовок" } },
      { type: "paragraph", payload: { html: "<p>три коротких слова</p>" } },
    ];

    expect(estimateLessonMinutes(blocks)).toBe(1);
    expect(estimateLessonMinutes([])).toBe(1);
  });

  it("битый payload не ломает подсчёт", () => {
    const blocks = [
      { type: "paragraph", payload: null },
      { type: "audio", payload: "мусор" },
      { type: "quiz", payload: { options: "не массив" } },
      { type: "неизвестный", payload: { v: 1 } },
    ];

    expect(estimateLessonSeconds(blocks)).toBe(180 + 45);
    expect(estimateLessonMinutes(blocks)).toBe(4);
  });
});

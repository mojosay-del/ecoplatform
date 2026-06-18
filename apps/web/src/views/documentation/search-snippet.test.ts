import { describe, expect, it } from "vitest";
import { documentationSearchSnippetSegments, documentationSearchSnippetSourceLabel } from "./search-snippet";

describe("documentationSearchSnippetSegments", () => {
  it("разбивает текст на подсвеченные и обычные сегменты", () => {
    const segments = documentationSearchSnippetSegments({
      source: "description",
      text: "Документы для перевозки макулатуры",
      highlights: [{ start: 14, end: 23 }],
    });

    expect(segments).toEqual([
      { text: "Документы для ", highlighted: false },
      { text: "перевозки", highlighted: true },
      { text: " макулатуры", highlighted: false },
    ]);
  });

  it("нормализует пересекающиеся и выходящие за текст диапазоны", () => {
    const segments = documentationSearchSnippetSegments({
      source: "title",
      text: "Акт приёма",
      highlights: [
        { start: -5, end: 3 },
        { start: 2, end: 50 },
      ],
    });

    expect(segments).toEqual([{ text: "Акт приёма", highlighted: true }]);
  });
});

describe("documentationSearchSnippetSourceLabel", () => {
  it("подписывает источник совпадения", () => {
    expect(documentationSearchSnippetSourceLabel("title")).toBe("Найдено в названии");
    expect(documentationSearchSnippetSourceLabel("subtitle")).toBe("Найдено в описании");
    expect(documentationSearchSnippetSourceLabel("file")).toBe("Найдено в файле");
    expect(documentationSearchSnippetSourceLabel("description")).toBe("Найдено в тексте");
  });
});

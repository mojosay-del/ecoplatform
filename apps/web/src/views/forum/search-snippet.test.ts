import { describe, expect, it } from "vitest";
import { forumSearchSnippetSegments, forumSearchSnippetSourceLabel } from "./search-snippet";

describe("forum search snippet", () => {
  it("splits plain text into highlighted and regular segments", () => {
    const segments = forumSearchSnippetSegments({
      source: "answer",
      text: "Нужна лицензия и договор",
      highlights: [{ start: 6, end: 14 }],
    });

    expect(segments).toEqual([
      { text: "Нужна ", highlighted: false },
      { text: "лицензия", highlighted: true },
      { text: " и договор", highlighted: false },
    ]);
  });

  it("normalizes unsafe or overlapping highlight ranges without HTML rendering", () => {
    const segments = forumSearchSnippetSegments({
      source: "question",
      text: "<script>лицензия</script>",
      highlights: [
        { start: -10, end: 8 },
        { start: 5, end: 16 },
        { start: 30, end: 20 },
      ],
    });

    expect(segments).toEqual([
      { text: "<script>лицензия", highlighted: true },
      { text: "</script>", highlighted: false },
    ]);
  });

  it("returns reader-facing source labels", () => {
    expect(forumSearchSnippetSourceLabel("title")).toBe("Найдено в заголовке");
    expect(forumSearchSnippetSourceLabel("question")).toBe("Найдено в вопросе");
    expect(forumSearchSnippetSourceLabel("answer")).toBe("Найдено в ответе");
  });
});

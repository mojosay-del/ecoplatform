import type { ForumSearchSnippet } from "@ecoplatform/shared";

export type ForumSnippetSegment = {
  text: string;
  highlighted: boolean;
};

export function forumSearchSnippetSourceLabel(source: ForumSearchSnippet["source"]): string {
  if (source === "title") return "Найдено в заголовке";
  if (source === "answer") return "Найдено в ответе";
  return "Найдено в вопросе";
}

export function forumSearchSnippetSegments(snippet: ForumSearchSnippet): ForumSnippetSegment[] {
  const ranges = normalizeRanges(snippet.text.length, snippet.highlights);
  if (ranges.length === 0) {
    return [{ text: snippet.text, highlighted: false }];
  }

  const segments: ForumSnippetSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: snippet.text.slice(cursor, range.start), highlighted: false });
    }
    segments.push({ text: snippet.text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < snippet.text.length) {
    segments.push({ text: snippet.text.slice(cursor), highlighted: false });
  }
  return segments.filter((segment) => segment.text.length > 0);
}

function normalizeRanges(textLength: number, ranges: ForumSearchSnippet["highlights"]) {
  return ranges
    .map((range) => ({
      start: Math.max(0, Math.min(textLength, Math.trunc(range.start))),
      end: Math.max(0, Math.min(textLength, Math.trunc(range.end))),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<Array<{ start: number; end: number }>>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push(range);
      }
      return merged;
    }, []);
}

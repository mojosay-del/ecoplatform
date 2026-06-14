import { describe, expect, it } from "vitest";
import type { DocumentationNode } from "@ecoplatform/shared";
import { flattenDocuments, formatBytes, formatRuDate, freshness } from "./doc-helpers";

describe("formatBytes", () => {
  it("форматирует байты/КБ/МБ", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
    expect(formatBytes(48 * 1024)).toBe("48 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
  });
});

describe("formatRuDate", () => {
  it("форматирует ISO в дд.мм.гггг и null для пустого/битого", () => {
    expect(formatRuDate("2026-05-28T00:00:00.000Z")).toBe("28.05.2026");
    expect(formatRuDate(null)).toBeNull();
    expect(formatRuDate("не дата")).toBeNull();
  });
});

describe("freshness", () => {
  const now = new Date("2026-06-14T00:00:00.000Z").getTime();

  it("«updated», если revisedAt позже первой публикации и недавно", () => {
    expect(
      freshness({ firstPublishedAt: "2026-01-01T00:00:00.000Z", revisedAt: "2026-06-10T00:00:00.000Z" }, now),
    ).toBe("updated");
  });

  it("«new», если недавно опубликован и не обновлялся", () => {
    expect(
      freshness({ firstPublishedAt: "2026-06-01T00:00:00.000Z", revisedAt: "2026-06-01T00:00:00.000Z" }, now),
    ).toBe("new");
  });

  it("null, если публикация давно и без свежих изменений", () => {
    expect(
      freshness({ firstPublishedAt: "2026-01-01T00:00:00.000Z", revisedAt: "2026-01-01T00:00:00.000Z" }, now),
    ).toBeNull();
  });
});

describe("flattenDocuments", () => {
  it("собирает только документы-листья, пропуская разделы", () => {
    const tree = [
      {
        id: "c1",
        iconType: "category",
        children: [
          { id: "d1", iconType: null, children: [] },
          { id: "d2", iconType: null },
        ],
      },
      { id: "d3", iconType: null },
    ] as unknown as DocumentationNode[];
    expect(flattenDocuments(tree).map((node) => node.id)).toEqual(["d1", "d2", "d3"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  addNewsTagSelection,
  buildNewsUrl,
  filterNewsTagOptions,
  normaliseNewsTagSelection,
  toggleNewsTagSelection,
} from "./news-tag-filters";

describe("news tag filters", () => {
  it("normalises URL tag params without empty values or duplicates", () => {
    expect(normaliseNewsTagSelection([" рынок ", "", "пластик", "рынок"])).toEqual(["рынок", "пластик"]);
  });

  it("adds and toggles tag selection predictably", () => {
    expect(addNewsTagSelection(["рынок"], " пластик ")).toEqual(["рынок", "пластик"]);
    expect(addNewsTagSelection(["рынок"], "рынок")).toEqual(["рынок"]);
    expect(toggleNewsTagSelection(["рынок", "пластик"], "рынок")).toEqual(["пластик"]);
    expect(toggleNewsTagSelection(["рынок"], "экология")).toEqual(["рынок", "экология"]);
  });

  it("filters dropdown tag options by partial text", () => {
    const tags = [
      { id: "1", name: "рынок", usageCount: 7 },
      { id: "2", name: "Пластик", usageCount: 2 },
      { id: "3", name: "Макулатура", usageCount: 1 },
    ];

    expect(filterNewsTagOptions(tags, "лас").map((tag) => tag.name)).toEqual(["Пластик"]);
    expect(filterNewsTagOptions(tags, " РЫН ").map((tag) => tag.name)).toEqual(["рынок"]);
    expect(filterNewsTagOptions(tags, "").map((tag) => tag.name)).toEqual(["рынок", "Пластик", "Макулатура"]);
  });

  it("builds /news URLs while preserving unrelated query params and clearing post when filter changes", () => {
    expect(buildNewsUrl("post=old-slug&tag=old&source=demo", ["рынок", "пластик"])).toBe(
      "/news?source=demo&tag=%D1%80%D1%8B%D0%BD%D0%BE%D0%BA&tag=%D0%BF%D0%BB%D0%B0%D1%81%D1%82%D0%B8%D0%BA",
    );
    expect(buildNewsUrl("tag=рынок", ["рынок"], "fresh-slug")).toBe(
      "/news?tag=%D1%80%D1%8B%D0%BD%D0%BE%D0%BA&post=fresh-slug",
    );
    expect(buildNewsUrl("tag=рынок", [])).toBe("/news");
  });

  it("removes one selected tag while preserving the remaining filters and unrelated URL params", () => {
    const remainingTags = toggleNewsTagSelection(["рынок", "пластик"], "рынок");

    expect(buildNewsUrl("tag=рынок&tag=пластик&source=card", remainingTags)).toBe(
      "/news?source=card&tag=%D0%BF%D0%BB%D0%B0%D1%81%D1%82%D0%B8%D0%BA",
    );
    expect(buildNewsUrl("tag=рынок&source=card", toggleNewsTagSelection(["рынок"], "рынок"))).toBe("/news?source=card");
  });
});

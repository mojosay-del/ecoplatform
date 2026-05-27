import { describe, expect, it } from "vitest";
import {
  addNewsTagSelection,
  buildNewsUrl,
  getVisibleNewsTagNames,
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

  it("keeps selected direct URL tags visible before top tags", () => {
    const topTags = ["рынок", "пластик", "экология", "логистика"];

    expect(getVisibleNewsTagNames(topTags, ["срочно", "рынок"])).toEqual([
      "срочно",
      "рынок",
      "пластик",
      "экология",
      "логистика",
    ]);
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
});

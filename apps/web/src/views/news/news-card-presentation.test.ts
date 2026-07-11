import { describe, expect, it } from "vitest";
import { newsCardLabels, newsCardTagState } from "./news-card-presentation";

describe("news card presentation", () => {
  it("keeps the news category and shows the extended tier as a separate label", () => {
    expect(newsCardLabels("extended")).toEqual({ category: "Новости", tier: "Расширенная" });
    expect(newsCardLabels("basic")).toEqual({ category: "Новости", tier: null });
  });

  it("shows the remove icon only inside a selected tag capsule", () => {
    expect(newsCardTagState(["рынок"], "рынок")).toEqual({ isActive: true, showRemoveIcon: true });
    expect(newsCardTagState(["рынок"], "пластик")).toEqual({ isActive: false, showRemoveIcon: false });
  });
});

import { describe, expect, it } from "vitest";
import {
  EMPTY_RATING_ARIA_LABEL,
  EMPTY_RATING_DESCRIPTION,
  EMPTY_RATING_TITLE,
  formatRatingValue,
} from "./review-rating";

describe("marketplace rating display", () => {
  it("uses a neutral empty-rating label for new companies", () => {
    expect(EMPTY_RATING_TITLE).toBe("Новый участник");
    expect(EMPTY_RATING_DESCRIPTION).toBe("Пока нет отзывов после сделок");
    expect(EMPTY_RATING_ARIA_LABEL).toBe("Новый участник. Пока нет отзывов после сделок");
  });

  it("keeps existing numeric ratings formatted with one decimal", () => {
    expect(formatRatingValue(4.64)).toBe("4.6");
  });
});

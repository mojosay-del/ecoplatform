import { describe, expect, it } from "vitest";
import { contaminationLabel, moistureLabel } from "./listing-characteristics";

describe("marketplace listing characteristics", () => {
  it("formats moisture from the text condition", () => {
    expect(moistureLabel({ moistureCondition: "slightly_wet" })).toBe("Немного влажное");
  });

  it("formats contamination from the text condition", () => {
    expect(contaminationLabel({ contaminationCondition: "may_have_inclusions" })).toBe(
      "Могут быть иные включения",
    );
  });
});

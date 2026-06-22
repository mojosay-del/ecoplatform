import { describe, expect, it } from "vitest";
import { normalizeFileNameEncoding } from "./file-name.helpers";

describe("normalizeFileNameEncoding", () => {
  it("восстанавливает UTF-8 кириллицу, ошибочно прочитанную как latin1", () => {
    const mojibakeName = Buffer.from("Акт об уничтожении.xlsx", "utf8").toString("latin1");

    expect(normalizeFileNameEncoding(mojibakeName)).toBe("Акт об уничтожении.xlsx");
  });

  it("не меняет обычные ASCII и корректные кириллические имена", () => {
    expect(normalizeFileNameEncoding("report-final.pdf")).toBe("report-final.pdf");
    expect(normalizeFileNameEncoding("Спецификация.pdf")).toBe("Спецификация.pdf");
  });
});

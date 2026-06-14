import { describe, expect, it } from "vitest";
import { documentationFileFormat } from "./documentation-response.helpers";

describe("documentationFileFormat", () => {
  it("берёт расширение из имени файла и нормализует регистр", () => {
    expect(documentationFileFormat("dogovor.DOCX", "application/octet-stream")).toBe("docx");
    expect(documentationFileFormat("Спецификация.pdf", "application/octet-stream")).toBe("pdf");
    expect(documentationFileFormat("tablica.xlsx", "application/octet-stream")).toBe("xlsx");
    expect(documentationFileFormat("archive.tar.gz", "application/octet-stream")).toBe("gz");
  });

  it("падает на mime-тип, если расширения в имени нет", () => {
    expect(documentationFileFormat("noext", "application/pdf")).toBe("pdf");
    expect(documentationFileFormat("noext", "application/vnd.ms-excel")).toBe("xls");
    expect(documentationFileFormat("trailingdot.", "application/msword")).toBe("doc");
  });

  it("возвращает «file» для неизвестного формата без расширения", () => {
    expect(documentationFileFormat("noext", "unknown/type")).toBe("file");
  });
});

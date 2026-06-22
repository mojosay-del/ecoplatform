import { describe, expect, it } from "vitest";
import { documentationFileFormat, mapDocumentationDetail } from "./documentation-response.helpers";

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

describe("mapDocumentationDetail", () => {
  it("возвращает нормализованное кириллическое имя файла и формат", () => {
    const mojibakeName = Buffer.from("Акт об уничтожении.xlsx", "utf8").toString("latin1");
    const detail = mapDocumentationDetail({
      id: "doc-1",
      slug: "akt-ob-unichtozhenii",
      title: "Акт об уничтожении",
      subtitle: null,
      iconType: null,
      displayIcon: null,
      parentId: null,
      position: 0,
      status: "published",
      isPinned: false,
      version: null,
      effectiveDate: null,
      firstPublishedAt: null,
      revisedAt: null,
      file: {
        id: "file-1",
        originalName: mojibakeName,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 2048,
      },
      blocks: [],
      parent: null,
    } as any);

    expect(detail.file?.fileName).toBe("Акт об уничтожении.xlsx");
    expect(detail.file?.format).toBe("xlsx");
  });
});

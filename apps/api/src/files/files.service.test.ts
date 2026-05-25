import { describe, expect, it, vi } from "vitest";
import { FileAccessLevel } from "@prisma/client";
import { FilesService } from "./files.service";

function serviceWithPrisma(prisma: Record<string, unknown>) {
  return new FilesService(prisma as any);
}

function referencePrisma(overrides: Record<string, unknown> = {}) {
  return {
    newsPost: { count: vi.fn().mockResolvedValue(0) },
    learningModule: { count: vi.fn().mockResolvedValue(0) },
    knowledgeBaseArticle: { count: vi.fn().mockResolvedValue(0) },
    lessonAttachment: { count: vi.fn().mockResolvedValue(0) },
    commentAttachment: { count: vi.fn().mockResolvedValue(0) },
    newsContentBlock: { findMany: vi.fn().mockResolvedValue([]) },
    lessonContentBlock: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeBaseBlock: { findMany: vi.fn().mockResolvedValue([]) },
    fileReference: { count: vi.fn().mockResolvedValue(0) },
    fileAsset: {
      findUnique: vi.fn().mockResolvedValue({
        id: "file-1",
        storageKey: "uploads/2026-05-22/file.webp",
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe("FilesService cleanup", () => {
  it("удаляет метаданные файла, если на него нигде не ссылаются", async () => {
    const prisma = referencePrisma();
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).toHaveBeenCalledWith({ where: { id: "file-1" } });
  });

  it("сохраняет файл, если на него есть запись в FileReference", async () => {
    const prisma = referencePrisma({
      fileReference: { count: vi.fn().mockResolvedValue(1) },
    });
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).not.toHaveBeenCalled();
  });

  it("сохраняет файл, если он указан как cover в структурированном поле", async () => {
    const prisma = referencePrisma({
      newsPost: { count: vi.fn().mockResolvedValue(1) },
    });
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).not.toHaveBeenCalled();
  });

  it("сохраняет файл, если он встречается в payload блока контента", async () => {
    const prisma = referencePrisma({
      lessonContentBlock: {
        findMany: vi.fn().mockResolvedValue([{ payload: { images: [{ fileId: "file-1" }] } }]),
      },
    });
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).not.toHaveBeenCalled();
  });
});

describe("FilesService file listing", () => {
  it("возвращает по ids только публичные файлы", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    await service.findManyByIds(["public-file", "private-file", "public-file"]);

    expect(prisma.fileAsset.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["public-file", "private-file"] },
        accessLevel: FileAccessLevel.public,
      },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("FilesService upload validation", () => {
  it("отклоняет HTML, даже если multipart-заголовок притворяется картинкой", async () => {
    const prisma = referencePrisma();
    const service = serviceWithPrisma(prisma);
    const buffer = Buffer.from("<!doctype html><script>alert(1)</script>");

    await expect(
      service.upload(
        {
          originalname: "attack.png",
          mimetype: "image/png",
          size: buffer.length,
          buffer,
        },
        {},
        "user-1",
      ),
    ).rejects.toThrow("Не удалось определить безопасный тип файла.");
  });

  it("явно блокирует SVG по MIME и расширению", async () => {
    const prisma = referencePrisma();
    const service = serviceWithPrisma(prisma);
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    await expect(
      service.upload(
        {
          originalname: "vector.svg",
          mimetype: "image/svg+xml",
          size: buffer.length,
          buffer,
        },
        {},
        "user-1",
      ),
    ).rejects.toThrow("Формат файла не поддерживается.");
  });

  it("сохраняет разрешённый PDF как attachment с реальным MIME из magic-number", async () => {
    const send = vi.fn().mockResolvedValue({});
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n%test\n"), Buffer.alloc(5000)]);
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "file-pdf",
            createdAt: new Date("2026-05-25T00:00:00.000Z"),
            ...data,
          }),
        ),
      },
    });
    const service = serviceWithPrisma(prisma);
    (service as unknown as { getClient: () => unknown }).getClient = () => ({
      client: { send },
      bucket: "bucket",
    });

    const result = await service.upload(
      {
        originalname: "report.pdf",
        mimetype: "application/pdf",
        size: pdf.length,
        buffer: pdf,
      },
      {},
      "user-1",
    );

    const command = send.mock.calls[0]?.[0] as { input?: Record<string, unknown> } | undefined;
    expect(command?.input).toMatchObject({
      Bucket: "bucket",
      ContentType: "application/pdf",
      ContentDisposition: expect.stringContaining("attachment;"),
      ContentLength: pdf.length,
    });
    expect(prisma.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        uploadedById: "user-1",
      }),
    });
    expect(result.mimeType).toBe("application/pdf");
  });
});

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

import { describe, expect, it, vi } from "vitest";
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
  it("deletes file metadata when an asset is no longer referenced", async () => {
    const prisma = referencePrisma();
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).toHaveBeenCalledWith({ where: { id: "file-1" } });
  });

  it("keeps an asset referenced from content block payloads", async () => {
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

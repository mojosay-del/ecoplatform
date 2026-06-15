import { describe, expect, it, vi } from "vitest";
import { backfillFileReferences } from "./files-reference.helpers";

describe("files-reference helpers", () => {
  it("дозаполняет пустые типы FileReference, даже если другие типы уже есть", async () => {
    const existingByType: Record<string, number> = {
      news_post: 1,
      knowledge_base_article: 1,
      learning_module: 1,
      documentation_article: 0,
      marketplace_listing: 0,
    };
    const tx = {
      fileReference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      fileReference: {
        count: vi.fn(async (args: { where?: { entityType?: string } }) => {
          return existingByType[args.where?.entityType ?? ""] ?? 0;
        }),
      },
      fileAsset: {
        findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) => {
          return args.where.id.in.filter((id) => id !== "missing-file").map((id) => ({ id }));
        }),
      },
      $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<void>) => callback(tx)),
      newsPost: { findMany: vi.fn().mockResolvedValue([]) },
      knowledgeBaseArticle: { findMany: vi.fn().mockResolvedValue([]) },
      learningModule: { findMany: vi.fn().mockResolvedValue([]) },
      documentationArticle: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "doc-1",
            fileAssetId: "doc-file",
            blocks: [{ payload: { gallery: [{ fileId: "doc-block-file" }, { fileId: "missing-file" }] } }],
          },
        ]),
      },
      marketplaceListing: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "listing-1",
            media: [{ fileId: "listing-file" }, { fileId: "listing-file" }],
          },
        ]),
      },
    };

    const result = await backfillFileReferences({ prisma } as any);

    expect(result).toEqual({ scanned: 2 });
    expect(prisma.newsPost.findMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeBaseArticle.findMany).not.toHaveBeenCalled();
    expect(prisma.learningModule.findMany).not.toHaveBeenCalled();
    expect(prisma.documentationArticle.findMany).toHaveBeenCalledWith({ include: { blocks: true } });
    expect(prisma.marketplaceListing.findMany).toHaveBeenCalledWith({ include: { media: true } });
    expect(tx.fileReference.createMany).toHaveBeenNthCalledWith(1, {
      data: [
        { fileId: "doc-file", entityType: "documentation_article", entityId: "doc-1" },
        { fileId: "doc-block-file", entityType: "documentation_article", entityId: "doc-1" },
      ],
      skipDuplicates: true,
    });
    expect(tx.fileReference.createMany).toHaveBeenNthCalledWith(2, {
      data: [{ fileId: "listing-file", entityType: "marketplace_listing", entityId: "listing-1" }],
      skipDuplicates: true,
    });
  });
});

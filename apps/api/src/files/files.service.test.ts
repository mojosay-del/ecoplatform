import { describe, expect, it, vi } from "vitest";
import { FileAccessLevel } from "@prisma/client";
import sharp from "sharp";
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
    user: {
      findUnique: vi.fn().mockResolvedValue({ companyId: null }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    fileAsset: {
      findUnique: vi.fn().mockResolvedValue({
        id: "file-1",
        storageKey: "uploads/2026-05-22/file.webp",
      }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
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

  it("удаляет S3-объекты всех вариантов, если файл не используется", async () => {
    const send = vi.fn().mockResolvedValue({});
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "file-1",
          storageKey: "uploads/2026-05-22/file.webp",
          variants: {
            webp: { storageKey: "uploads/2026-05-22/file.webp", mimeType: "image/webp", sizeBytes: 100 },
            avif: { storageKey: "uploads/2026-05-22/file.avif", mimeType: "image/avif", sizeBytes: 80 },
          },
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
    });
    const service = serviceWithPrisma(prisma);
    (service as unknown as { getS3Config: () => unknown }).getS3Config = () => ({
      client: { send },
      bucket: "bucket",
    });

    await service.deleteIfUnreferenced(["file-1"]);

    expect(send.mock.calls.map(([command]) => command.input.Key).sort()).toEqual([
      "uploads/2026-05-22/file.avif",
      "uploads/2026-05-22/file.webp",
    ]);
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
        aggregate: vi.fn(),
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
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
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

  it("для cover-upload сохраняет WebP и AVIF варианты в S3 и метаданных", async () => {
    const send = vi.fn().mockResolvedValue({});
    const source = await sharp({
      create: {
        width: 1400,
        height: 700,
        channels: 3,
        background: "#5f7a8d",
      },
    })
      .png()
      .toBuffer();
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "file-cover",
            createdAt: new Date("2026-05-25T00:00:00.000Z"),
            variants: data.variants ?? null,
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
        originalname: "cover.png",
        mimetype: "image/png",
        size: source.length,
        buffer: source,
      },
      { imagePreset: "cover", accessLevel: FileAccessLevel.public },
      "user-1",
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([command]) => command.input.ContentType).sort()).toEqual(["image/avif", "image/webp"]);
    expect(prisma.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalName: "cover.png",
        mimeType: "image/webp",
        accessLevel: FileAccessLevel.public,
        variants: {
          webp: expect.objectContaining({
            mimeType: "image/webp",
            storageKey: expect.stringMatching(/\.webp$/),
          }),
          avif: expect.objectContaining({
            mimeType: "image/avif",
            storageKey: expect.stringMatching(/\.avif$/),
          }),
        },
      }),
    });
    expect(result.mimeType).toBe("image/webp");
    expect(result.variants?.avif?.storageKey).toMatch(/\.avif$/);
  });

  it("отклоняет upload, если компания превысила дневной лимит 500 МБ", async () => {
    const almostFull = 499 * 1024 * 1024;
    const prisma = referencePrisma({
      user: {
        findUnique: vi.fn().mockResolvedValue({ companyId: "company-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]),
      },
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: almostFull } }),
        create: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);
    (service as unknown as { getClient: () => unknown }).getClient = vi.fn();
    const buffer = Buffer.alloc(2 * 1024 * 1024);

    await expect(
      service.upload(
        {
          originalname: "too-much.pdf",
          mimetype: "application/pdf",
          size: buffer.length,
          buffer,
        },
        {},
        "user-1",
      ),
    ).rejects.toThrow("Дневной лимит загрузок исчерпан.");

    expect(prisma.fileAsset.aggregate).toHaveBeenCalledWith({
      where: {
        uploadedById: { in: ["user-1", "user-2"] },
        createdAt: { gte: expect.any(Date) },
      },
      _sum: { sizeBytes: true },
    });
    expect((service as unknown as { getClient: () => unknown }).getClient).not.toHaveBeenCalled();
  });
});

describe("FilesService cover ownership", () => {
  it("запрещает content manager использовать чужой файл как обложку", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          accessLevel: FileAccessLevel.public,
          mimeType: "image/webp",
          uploadedById: "other-user",
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        delete: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    await expect(
      service.assertCoverImageAllowed("cover-1", {
        id: "content-manager-1",
        platformRoles: ["content_manager"],
      } as any),
    ).rejects.toThrow("В качестве обложки можно использовать только файл, загруженный вами.");
  });

  it("разрешает админу использовать публичное изображение другого автора", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          accessLevel: FileAccessLevel.public,
          mimeType: "image/webp",
          uploadedById: "content-manager-1",
        }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        delete: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    await expect(
      service.assertCoverImageAllowed("cover-1", {
        id: "admin-1",
        platformRoles: ["admin"],
      } as any),
    ).resolves.toBeUndefined();
  });
});

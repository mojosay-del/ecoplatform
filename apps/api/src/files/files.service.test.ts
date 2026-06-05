import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileAccessLevel } from "@prisma/client";
import sharp from "sharp";
import { FilesService } from "./files.service";

// Presigner мокаем: реальная подпись ходит к конфигу S3, нам же важна только
// логика выбора бакета и того, что для приватных файлов вызывается presign.
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(
    async (_client: unknown, command: { input: { Bucket: string; Key: string } }) =>
      `https://signed.example/${command.input.Bucket}/${command.input.Key}`,
  ),
}));

// S3-клиент мокаем на ГРАНИЦЕ SDK (а не присваиванием приватных методов сервиса):
// new S3Client() отдаёт фейк с общим s3Send. Тесты задают окружение через withEnv*
// (CONFIGURED_S3_ENV), реальный getS3Config создаёт мок-клиент, а ассерты идут по
// s3Send. Так тест не зависит от того, где физически лежит S3-логика.
const { s3Send } = vi.hoisted(() => ({ s3Send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  // new S3Client() должен быть конструируемым — поэтому function, а не стрелка.
  return {
    ...actual,
    S3Client: vi.fn(function MockS3Client(this: { send: typeof s3Send; destroy: () => void }) {
      this.send = s3Send;
      this.destroy = () => {};
    }),
  };
});

beforeEach(() => {
  s3Send.mockReset();
  s3Send.mockResolvedValue({});
});

function serviceWithPrisma(prisma: Record<string, unknown>) {
  return new FilesService(prisma as any);
}

async function withEnvAsync<T>(updates: Record<string, string | undefined>, action: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(updates).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(updates)) {
    restoreEnv(name, value);
  }
  try {
    return await action();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name, value);
    }
  }
}

const CONFIGURED_S3_ENV = {
  S3_ENDPOINT: "https://s3.twcstorage.ru",
  S3_PUBLIC_BASE_URL: "https://s3.twcstorage.ru",
  S3_BUCKET: "public-bucket",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function withEnv<T>(updates: Record<string, string | undefined>, action: () => T): T {
  const previous = Object.fromEntries(Object.keys(updates).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(updates)) {
    restoreEnv(name, value);
  }

  try {
    return action();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name, value);
    }
  }
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

describe("FilesService S3 health", () => {
  it("считает replace-with значения из .env.example ненастроенным S3", () => {
    const service = serviceWithPrisma(referencePrisma());

    withEnv(
      {
        S3_ENDPOINT: "https://s3.twcstorage.ru",
        S3_BUCKET: "replace-with-bucket-name",
        S3_ACCESS_KEY_ID: "replace-with-access-key",
        S3_SECRET_ACCESS_KEY: "replace-with-secret-key",
      },
      () => {
        expect(service.getS3HealthConfig()).toEqual({ configured: false });
      },
    );
  });
});

describe("FilesService cleanup", () => {
  it("удаляет метаданные файла, если на него нигде не ссылаются", async () => {
    const prisma = referencePrisma();
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"]);

    expect(prisma.fileAsset.delete).toHaveBeenCalledWith({ where: { id: "file-1" } });
  });

  it("удаляет S3-объекты всех вариантов, если файл не используется", async () => {
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

    await withEnvAsync(CONFIGURED_S3_ENV, () => service.deleteIfUnreferenced(["file-1"]));

    expect(s3Send.mock.calls.map(([command]) => command.input.Key).sort()).toEqual([
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

  it("запрещает content manager удалять чужой неиспользуемый файл", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "file-1",
          storageKey: "uploads/2026-05-22/file.webp",
          uploadedById: "other-user",
        }),
        aggregate: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    await expect(
      service.deleteIfUnreferenced(["file-1"], {
        id: "content-manager-1",
        platformRoles: ["content_manager"],
      } as any),
    ).rejects.toThrow("Можно удалить только файл, загруженный вами.");

    expect(prisma.fileAsset.delete).not.toHaveBeenCalled();
  });

  it("разрешает админу удалить чужой неиспользуемый файл", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "file-1",
          storageKey: "uploads/2026-05-22/file.webp",
          uploadedById: "other-user",
        }),
        aggregate: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
      },
    });
    const service = serviceWithPrisma(prisma);

    await service.deleteIfUnreferenced(["file-1"], {
      id: "admin-1",
      platformRoles: ["admin"],
    } as any);

    expect(prisma.fileAsset.delete).toHaveBeenCalledWith({ where: { id: "file-1" } });
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
  it("применяет safe-type проверки и квоту к metadata-only файлам", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "file-pdf",
            createdAt: new Date("2026-05-25T00:00:00.000Z"),
            variants: null,
            ...data,
          }),
        ),
      },
    });
    const service = serviceWithPrisma(prisma);

    const result = await service.createMetadata(
      {
        originalName: "report final.pdf",
        mimeType: "application/x-pdf",
        sizeBytes: 1024,
        accessLevel: FileAccessLevel.authenticated,
      },
      "user-1",
    );

    expect(prisma.fileAsset.aggregate).toHaveBeenCalledWith({
      where: {
        uploadedById: { in: ["user-1"] },
        createdAt: { gte: expect.any(Date) },
      },
      _sum: { sizeBytes: true },
    });
    expect(prisma.fileAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalName: "report final.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        storageKey: expect.stringMatching(/^uploads\/\d{4}-\d{2}-\d{2}\/.+-report-final\.pdf$/),
        uploadedById: "user-1",
      }),
    });
    expect(result.mimeType).toBe("application/pdf");
  });

  it("отклоняет metadata-only SVG так же, как настоящий upload", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        create: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    await expect(
      service.createMetadata(
        {
          originalName: "vector.svg",
          mimeType: "image/svg+xml",
          sizeBytes: 512,
          accessLevel: FileAccessLevel.public,
        },
        "user-1",
      ),
    ).rejects.toThrow("Формат файла не поддерживается.");

    expect(prisma.fileAsset.create).not.toHaveBeenCalled();
  });

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

    const result = await withEnvAsync(CONFIGURED_S3_ENV, () =>
      service.upload(
        {
          originalname: "report.pdf",
          mimetype: "application/pdf",
          size: pdf.length,
          buffer: pdf,
        },
        {},
        "user-1",
      ),
    );

    const command = s3Send.mock.calls[0]?.[0] as { input?: Record<string, unknown> } | undefined;
    expect(command?.input).toMatchObject({
      Bucket: "public-bucket",
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

    const result = await withEnvAsync(CONFIGURED_S3_ENV, () =>
      service.upload(
        {
          originalname: "cover.png",
          mimetype: "image/png",
          size: source.length,
          buffer: source,
        },
        { imagePreset: "cover", accessLevel: FileAccessLevel.public },
        "user-1",
      ),
    );

    expect(s3Send).toHaveBeenCalledTimes(2);
    expect(s3Send.mock.calls.map(([command]) => command.input.ContentType).sort()).toEqual([
      "image/avif",
      "image/webp",
    ]);
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
    expect(s3Send).not.toHaveBeenCalled();
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

describe("FilesService приватный бакет + signed URL", () => {
  it("кладёт приватный файл в приватный бакет при upload", async () => {
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n%test\n"), Buffer.alloc(5000)]);
    const prisma = referencePrisma({
      fileAsset: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: "file-pdf", createdAt: new Date("2026-06-02T00:00:00.000Z"), ...data }),
          ),
      },
    });
    const service = serviceWithPrisma(prisma);

    await withEnvAsync({ ...CONFIGURED_S3_ENV, S3_PRIVATE_BUCKET: "private-bucket" }, async () => {
      await service.upload(
        { originalname: "secret.pdf", mimetype: "application/pdf", size: pdf.length, buffer: pdf },
        { accessLevel: FileAccessLevel.authenticated },
        "user-1",
      );
    });

    const command = s3Send.mock.calls[0]?.[0] as { input?: Record<string, unknown> } | undefined;
    expect(command?.input?.Bucket).toBe("private-bucket");
  });

  it("findManyByIds: контент-менеджер видит приватные файлы и получает presigned downloadUrl", async () => {
    const prisma = referencePrisma({
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "priv-1",
            storageKey: "uploads/2026-06-02/a.pdf",
            accessLevel: FileAccessLevel.authenticated,
            originalName: "a.pdf",
            mimeType: "application/pdf",
            sizeBytes: 10,
            variants: null,
            createdAt: new Date("2026-06-02T00:00:00.000Z"),
          },
        ]),
        findUnique: vi.fn(),
        aggregate: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = serviceWithPrisma(prisma);

    const result = await withEnvAsync({ ...CONFIGURED_S3_ENV, S3_PRIVATE_BUCKET: "private-bucket" }, () =>
      service.findManyByIds(["priv-1"], { id: "cm-1", platformRoles: ["content_manager"] } as any),
    );

    // Контент-персоналу фильтр по accessLevel НЕ применяется.
    expect(prisma.fileAsset.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["priv-1"] } },
      orderBy: { createdAt: "desc" },
    });
    expect(result[0]?.downloadUrl).toBe("https://signed.example/private-bucket/uploads/2026-06-02/a.pdf");
  });

  it("signDownloadUrls: public → прямая публичная ссылка", async () => {
    const service = serviceWithPrisma(referencePrisma());

    const urls = await withEnvAsync(CONFIGURED_S3_ENV, () =>
      service.signDownloadUrls([
        { id: "pub", storageKey: "uploads/x/cover.webp", accessLevel: FileAccessLevel.public, originalName: "c.webp" },
      ]),
    );

    expect(urls.get("pub")).toBe("https://s3.twcstorage.ru/public-bucket/uploads/x/cover.webp");
  });

  it("signDownloadUrls: приватный файл при настроенном приватном бакете → presigned GET", async () => {
    const service = serviceWithPrisma(referencePrisma());

    const urls = await withEnvAsync({ ...CONFIGURED_S3_ENV, S3_PRIVATE_BUCKET: "private-bucket" }, () =>
      service.signDownloadUrls([
        {
          id: "priv",
          storageKey: "uploads/x/doc.pdf",
          accessLevel: FileAccessLevel.authenticated,
          originalName: "doc.pdf",
        },
      ]),
    );

    expect(urls.get("priv")).toBe("https://signed.example/private-bucket/uploads/x/doc.pdf");
  });

  it("signDownloadUrls: приватный файл без приватного бакета → fallback на публичную ссылку (без регрессии)", async () => {
    const service = serviceWithPrisma(referencePrisma());

    const urls = await withEnvAsync({ ...CONFIGURED_S3_ENV, S3_PRIVATE_BUCKET: undefined }, () =>
      service.signDownloadUrls([
        {
          id: "priv",
          storageKey: "uploads/x/doc.pdf",
          accessLevel: FileAccessLevel.authenticated,
          originalName: "doc.pdf",
        },
      ]),
    );

    expect(urls.get("priv")).toBe("https://s3.twcstorage.ru/public-bucket/uploads/x/doc.pdf");
  });
});

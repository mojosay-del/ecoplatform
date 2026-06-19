import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileAccessLevel } from "@prisma/client";
import { VideoTranscodeService } from "./video-transcode.service";
import { parseVideoRenditions } from "./video-renditions";

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

describe("VideoTranscodeService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("помечает видео failed, если ffprobe/ffmpeg недоступен", async () => {
    const prisma = {
      fileAsset: {
        findUnique: vi.fn().mockResolvedValue({
          id: "video-1",
          originalName: "lesson.mov",
          mimeType: "video/quicktime",
          storageKey: "uploads/2026-06-19/lesson.mov",
          accessLevel: FileAccessLevel.public,
          videoRenditions: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = new VideoTranscodeService(prisma as never);
    const internals = service as unknown as {
      downloadObject: (...args: unknown[]) => Promise<void>;
      probeDimensions: (...args: unknown[]) => Promise<{ width: number; height: number }>;
    };
    vi.spyOn(internals, "downloadObject").mockResolvedValue(undefined);
    vi.spyOn(internals, "probeDimensions").mockRejectedValue(new Error("spawn ffprobe ENOENT"));

    const result = await withEnvAsync(CONFIGURED_S3_ENV, () => service.processAsset("video-1"));

    expect(result).toBe(false);
    expect(prisma.fileAsset.update).toHaveBeenCalledTimes(2);
    const failedUpdate = prisma.fileAsset.update.mock.calls[1]?.[0];
    expect(parseVideoRenditions(failedUpdate?.data.videoRenditions)?.status).toBe("failed");
  });
});

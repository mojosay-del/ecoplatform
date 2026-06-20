import { describe, expect, it } from "vitest";
import { FileAccessLevel, VideoTranscodeStatus } from "@prisma/client";
import { VideoTranscodeService } from "./files/video-transcode.service";
import { setupIntegrationContext } from "./test/integration-context";

// M-10: транскодер должен брать САМОЕ СТАРОЕ незавершённое видео по индексу,
// а не «топ-50 свежих» с фильтром в JS (иначе старый pending голодает).

const ctx = setupIntegrationContext();

function videoData(overrides: { storageKey: string; createdAt: Date; videoStatus: VideoTranscodeStatus }) {
  return {
    originalName: "clip.mp4",
    mimeType: "video/mp4",
    sizeBytes: 1024,
    accessLevel: FileAccessLevel.public,
    videoRenditions: { status: overrides.videoStatus, renditions: [], updatedAt: overrides.createdAt.toISOString() },
    ...overrides,
  };
}

describe("VideoTranscodeService.claimNextPending (M-10)", () => {
  it("забирает самый старый pending даже из-под 50+ свежих обработанных видео", async () => {
    const prisma = ctx.prisma;
    const base = new Date("2020-01-01T00:00:00.000Z");

    // Самый старый — pending (в бэклоге, старше топ-50).
    const oldestPending = await prisma.fileAsset.create({
      data: videoData({ storageKey: "videos/oldest-pending", createdAt: base, videoStatus: VideoTranscodeStatus.pending }),
    });

    // 55 более свежих уже готовых видео — раньше они вытеснили бы pending из выборки.
    await prisma.fileAsset.createMany({
      data: Array.from({ length: 55 }, (_, i) =>
        videoData({
          storageKey: `videos/ready-${i}`,
          createdAt: new Date(base.getTime() + (i + 1) * 86_400_000),
          videoStatus: VideoTranscodeStatus.ready,
        }),
      ),
    });

    const service = ctx.app.get(VideoTranscodeService);
    const claim = (service as unknown as { claimNextPending: () => Promise<string | null> }).claimNextPending.bind(
      service,
    );

    // Забрали именно старейший pending и атомарно перевели его в processing.
    const claimedId = await claim();
    expect(claimedId).toBe(oldestPending.id);
    const claimed = await prisma.fileAsset.findUniqueOrThrow({ where: { id: oldestPending.id } });
    expect(claimed.videoStatus).toBe(VideoTranscodeStatus.processing);

    // Завершили обработку → больше незавершённых нет (ready не забираются).
    await prisma.fileAsset.update({
      where: { id: oldestPending.id },
      data: { videoStatus: VideoTranscodeStatus.ready },
    });
    expect(await claim()).toBeNull();
  });
});

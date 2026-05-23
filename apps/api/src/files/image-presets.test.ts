import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processCoverImage } from "./image-presets";

describe("processCoverImage", () => {
  it("converts a large cover image to webp within preset bounds", async () => {
    const source = await sharp({
      create: {
        width: 1800,
        height: 900,
        channels: 3,
        background: "#4b7f57",
      },
    })
      .png()
      .toBuffer();

    const result = await processCoverImage(source, "image/png");
    const metadata = await sharp(result.buffer).metadata();

    expect(result.mimeType).toBe("image/webp");
    expect(result.extension).toBe(".webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(1200);
    expect(metadata.height).toBeLessThanOrEqual(1200);
  });
});

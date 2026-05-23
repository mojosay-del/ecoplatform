import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

const COVER_MAX_DIMENSION = 1200;
const COVER_WEBP_QUALITY = 80;
const SUPPORTED_COVER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProcessedImage = {
  buffer: Buffer;
  extension: ".webp";
  mimeType: "image/webp";
};

export async function processCoverImage(buffer: Buffer, mimeType: string): Promise<ProcessedImage> {
  if (!SUPPORTED_COVER_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException("Обложка должна быть в формате JPG, PNG или WEBP.");
  }

  try {
    const output = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: COVER_MAX_DIMENSION,
        height: COVER_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: COVER_WEBP_QUALITY })
      .toBuffer();

    return {
      buffer: output,
      extension: ".webp",
      mimeType: "image/webp",
    };
  } catch {
    throw new BadRequestException("Не удалось обработать изображение обложки.");
  }
}

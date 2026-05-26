import { BadRequestException } from "@nestjs/common";
import sharp from "sharp";

const COVER_MAX_DIMENSION = 1200;
const COVER_WEBP_QUALITY = 80;
const COVER_AVIF_QUALITY = 50;
const SUPPORTED_COVER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ProcessedImageVariant = {
  format: "avif";
  buffer: Buffer;
  extension: ".avif";
  mimeType: "image/avif";
};

export type ProcessedImage = {
  buffer: Buffer;
  extension: ".webp";
  mimeType: "image/webp";
  variants: ProcessedImageVariant[];
};

export async function processCoverImage(buffer: Buffer, mimeType: string): Promise<ProcessedImage> {
  if (!SUPPORTED_COVER_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException("Обложка должна быть в формате JPG, PNG или WEBP.");
  }

  try {
    const pipeline = sharp(buffer, { failOn: "none" }).rotate().resize({
      width: COVER_MAX_DIMENSION,
      height: COVER_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    const [webp, avif] = await Promise.all([
      pipeline.clone().webp({ quality: COVER_WEBP_QUALITY }).toBuffer(),
      pipeline.clone().avif({ quality: COVER_AVIF_QUALITY }).toBuffer(),
    ]);

    return {
      buffer: webp,
      extension: ".webp",
      mimeType: "image/webp",
      variants: [
        {
          format: "avif",
          buffer: avif,
          extension: ".avif",
          mimeType: "image/avif",
        },
      ],
    };
  } catch {
    throw new BadRequestException("Не удалось обработать изображение обложки.");
  }
}

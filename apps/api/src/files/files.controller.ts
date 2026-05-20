import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { FileAccessLevel } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { FilesService } from "./files.service";

const fileMetadataSchema = z.object({
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  accessLevel: z.nativeEnum(FileAccessLevel).optional(),
});

@UseGuards(JwtAuthGuard)
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post("metadata")
  async createMetadata(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(fileMetadataSchema, body);
    return this.files.createMetadata(input, user.id);
  }
}

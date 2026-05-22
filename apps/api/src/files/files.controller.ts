import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { FileAccessLevel } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { FilesService, type UploadedMemoryFile } from "./files.service";

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

  @Get()
  async listByIds(@Query("ids") ids = "") {
    return this.files.findManyByIds(
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("metadata")
  async createMetadata(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(fileMetadataSchema, body);
    return this.files.createMetadata(input, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: UploadedMemoryFile | undefined, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(z.object({ accessLevel: z.nativeEnum(FileAccessLevel).optional() }), body);
    return this.files.upload(file, input, user.id);
  }
}

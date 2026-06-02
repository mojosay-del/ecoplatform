import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
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
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
  accessLevel: z.nativeEnum(FileAccessLevel).optional(),
});
const FILE_UPLOAD_THROTTLE = {
  short: { limit: 20, ttl: 60_000 },
  long: { limit: 20, ttl: 60_000 },
};

@UseGuards(JwtAuthGuard)
@Controller("files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  async listByIds(@Query("ids") ids = "", @CurrentUser() user: RequestUser) {
    return this.files.findManyByIds(
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
      user,
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
  @Throttle(FILE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    const input = parseBody(
      z.object({
        accessLevel: z.nativeEnum(FileAccessLevel).optional(),
        imagePreset: z.literal("cover").optional(),
      }),
      body,
    );
    return this.files.upload(file, input, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete(":id")
  async deleteIfUnreferenced(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    await this.files.deleteIfUnreferenced([id], user);
    return { ok: true };
  }
}

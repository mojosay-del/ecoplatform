import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { FilesService, type FileUploadRestriction, type UploadedMemoryFile } from "./files.service";

const FILE_UPLOAD_THROTTLE = {
  short: { limit: 20, ttl: 60_000 },
  long: { limit: 20, ttl: 60_000 },
};
const fileUploadSchema = z.object({
  accessLevel: z.nativeEnum(FileAccessLevel).optional(),
  imagePreset: z.literal("cover").optional(),
});
type FileUploadInput = z.infer<typeof fileUploadSchema>;
type AuthorizedUploadInput = FileUploadInput & { restriction?: FileUploadRestriction };

function canManageFiles(user: RequestUser): boolean {
  return user.platformRoles.includes("admin") || user.platformRoles.includes("content_manager");
}

function canUploadCompanyMedia(user: RequestUser): boolean {
  return Boolean(user.companyId);
}

function authorizeUpload(input: FileUploadInput, user: RequestUser): AuthorizedUploadInput {
  if (canManageFiles(user)) {
    return input;
  }

  if (!canUploadCompanyMedia(user)) {
    throw new ForbiddenException("Недостаточно прав для этого раздела.");
  }

  return {
    ...input,
    restriction: "media_only",
  };
}

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

  @Post("upload")
  @Throttle(FILE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    const input = authorizeUpload(parseBody(fileUploadSchema, body), user);
    return this.files.upload(file, input, user.id);
  }

  @Delete(":id")
  async deleteIfUnreferenced(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    await this.files.deleteIfUnreferenced([id], user);
    return { ok: true };
  }
}

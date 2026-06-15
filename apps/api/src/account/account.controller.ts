import { Body, Controller, Delete, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { accountProfileUpdateDtoSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { AccountService } from "./account.service";

const setAvatarSchema = z.object({ fileId: z.string().trim().min(1) });

@UseGuards(JwtAuthGuard)
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch("profile")
  async updateProfile(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountProfileUpdateDtoSchema, body);
    return this.account.updateProfile(user.id, input);
  }

  // Привязать загруженное (через /files/upload) фото к профилю как аватар.
  @Post("avatar")
  async setAvatar(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const { fileId } = parseBody(setAvatarSchema, body);
    return this.account.setAvatar(user.id, fileId);
  }

  // Снять аватар — вернуться к нейтральной иконке-заглушке.
  @Delete("avatar")
  async removeAvatar(@CurrentUser() user: RequestUser) {
    return this.account.removeAvatar(user.id);
  }
}

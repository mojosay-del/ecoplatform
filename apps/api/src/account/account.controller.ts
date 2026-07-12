import { Body, Controller, Delete, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import {
  accountContactChangeApplyDtoSchema,
  accountContactChangeStartDtoSchema,
  accountContactChangeVerifyDtoSchema,
  accountProfileUpdateDtoSchema,
  onboardingTourCompleteDtoSchema,
} from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { AccountService } from "./account.service";

export const setAvatarSchema = z.object({ fileId: z.string().trim().min(1) });
const CONTACT_CHANGE_THROTTLE = { short: { limit: 5, ttl: 60_000 } };

@UseGuards(JwtAuthGuard)
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch("profile")
  async updateProfile(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountProfileUpdateDtoSchema, body);
    return this.account.updateProfile(user.id, input);
  }

  // Отметить онбординг-тур пройденным: первичная инструкция показывается один
  // раз, любое её закрытие фиксируется за пользователем навсегда. Идемпотентно.
  @Post("onboarding/tours")
  async completeOnboardingTour(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(onboardingTourCompleteDtoSchema, body);
    return this.account.completeOnboardingTour(user.id, input.tour);
  }

  @Throttle(CONTACT_CHANGE_THROTTLE)
  @Post("contact-change/start")
  async startContactChange(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountContactChangeStartDtoSchema, body);
    return this.account.startContactChange(user.id, input);
  }

  @Throttle(CONTACT_CHANGE_THROTTLE)
  @Post("contact-change/verify")
  async verifyContactChange(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountContactChangeVerifyDtoSchema, body);
    return this.account.verifyContactChange(user.id, input);
  }

  @Throttle(CONTACT_CHANGE_THROTTLE)
  @Post("contact-change/apply")
  async applyContactChange(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountContactChangeApplyDtoSchema, body);
    return this.account.applyContactChange(user.id, input);
  }

  // M-9: подтверждение владения НОВЫМ email кодом, отправленным на новый адрес.
  @Throttle(CONTACT_CHANGE_THROTTLE)
  @Post("contact-change/confirm")
  async confirmContactChange(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(accountContactChangeVerifyDtoSchema, body);
    return this.account.confirmContactChange(user.id, input);
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

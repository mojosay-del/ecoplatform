import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/current-user.decorator";
import { JwtAuthGuard } from "../../common/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import type { RequestUser } from "../../common/request-user";
import { isPlatformSettingKey } from "./platform-settings.definitions";
import { PlatformSettingsService } from "./platform-settings.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  async list() {
    return this.settings.listSettings();
  }

  @Patch(":key")
  async update(@Param("key") key: string, @Body() body: { value: unknown }, @CurrentUser() user: RequestUser) {
    if (!isPlatformSettingKey(key)) {
      throw new BadRequestException("Неизвестный ключ настройки.");
    }
    if (!body || body.value === undefined) {
      throw new BadRequestException("Нужно передать поле value.");
    }
    return this.settings.setValue(key, body.value, user);
  }
}

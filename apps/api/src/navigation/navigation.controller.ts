import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { navVisibilitySchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { NavigationService } from "./navigation.service";

@Controller()
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  // Для всех залогиненных: какие пункты меню скрыты.
  @UseGuards(JwtAuthGuard)
  @Get("navigation/visibility")
  visibility() {
    return this.navigation.getVisibilityForClient();
  }

  // Полный конфиг для админ-редактора.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/navigation")
  adminView() {
    return this.navigation.getAdminView();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/navigation")
  update(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(navVisibilitySchema, body);
    return this.navigation.setHidden(input.hiddenKeys, user);
  }
}

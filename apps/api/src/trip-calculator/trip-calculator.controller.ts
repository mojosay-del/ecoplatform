import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { tripCalculatorSettingsSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { parseBody } from "../common/zod";
import type { RequestUser } from "../common/request-user";
import { TripCalculatorService } from "./trip-calculator.service";

@UseGuards(JwtAuthGuard)
@Controller("trip-calculator")
export class TripCalculatorController {
  constructor(private readonly tripCalculator: TripCalculatorService) {}

  // Настройки калькулятора компании-заготовителя: null, если ещё не сохраняли.
  @Get("settings")
  async getSettings(@CurrentUser() user: RequestUser) {
    return this.tripCalculator.getSettings(user);
  }

  // Полная замена блока настроек (vehicles/workers/цены/топливо/амортизация).
  @Patch("settings")
  async saveSettings(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const input = parseBody(tripCalculatorSettingsSchema, body);
    return this.tripCalculator.saveSettings(user, input);
  }
}

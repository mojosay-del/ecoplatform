import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { parseBody } from "../common/zod";
import { AddressGeocoderService } from "./address-geocoder.service";

export const geoAddressSuggestQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
  // Страна поиска адреса: РФ (вкл. новые территории) по умолчанию; Беларусь —
  // только при явном BY (иначе DaData её не находит). См. AddressGeocoderService.
  country: z.enum(["RU", "BY"]).default("RU"),
});

// Подсказки адреса (DaData) как ОБЩИЙ гео-сервис, не привязанный к торговой
// площадке. Раньше единственный роут address-suggest жил под MarketplaceController
// с MarketplaceEnabledGuard, из-за чего форма адреса компании в кабинете ломалась
// при выключенной площадке. Здесь роут доступен любому авторизованному
// пользователю (только JwtAuthGuard).
@UseGuards(JwtAuthGuard)
@Controller("geo")
export class GeoController {
  constructor(private readonly geocoder: AddressGeocoderService) {}

  @Get("address-suggest")
  async addressSuggest(@Query() query: Record<string, unknown>) {
    const input = parseBody(geoAddressSuggestQuerySchema, query);
    return this.geocoder.suggest(input.q, input.country);
  }
}

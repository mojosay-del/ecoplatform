import { createHash } from "crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { MarketplaceAddressSuggestion } from "@ecoplatform/shared";
import { RedisService } from "../redis/redis.service";

export type GeocodeResult = { lat: number; lon: number; region: string | null };

const GEOCODER_TIMEOUT_MS = 3_000;
const GEOCODER_URL = "https://catalog.api.2gis.com/3.0/items/geocode";
const GEOCODER_CACHE_PREFIX = "geo:2gis:v1";
const GEOCODER_CACHE_HIT_TTL_SECONDS = 7 * 24 * 60 * 60;
const GEOCODER_CACHE_EMPTY_TTL_SECONDS = 24 * 60 * 60;
// Поля, без которых из ответа не собрать адрес: координаты, адм. деление
// (регион/город) и компоненты улица/дом + полная строка для отображения.
const GEOCODER_FIELDS = "items.point,items.adm_div,items.address,items.full_name";

type DgisAdmDiv = { name?: string; type?: string };
type DgisAddressComponent = { type?: string; street?: string; number?: string };
type DgisItem = {
  name?: string;
  full_name?: string;
  address_name?: string;
  point?: { lat?: number; lon?: number };
  // Адм. деление: country/region/city/settlement/place/street… — берём по type.
  adm_div?: DgisAdmDiv[];
  address?: {
    postcode?: string;
    components?: DgisAddressComponent[];
  };
};

// Геокодер адресов через 2ГИС Catalog/Geocoder API (ключ — секрет окружения
// DGIS_GEOCODER_API_KEY, в клиент не попадает). Поведение при недоступности —
// graceful: возвращаем null/[], а доменная логика сохраняет данные без координат.
@Injectable()
export class AddressGeocoderService {
  private readonly logger = new Logger(AddressGeocoderService.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  async geocode(addressLine: string): Promise<GeocodeResult | null> {
    const items = await this.fetchItems(addressLine, 1);
    const item = items[0];
    if (!item) {
      return null;
    }

    const point = parsePoint(item);
    if (!point) {
      return null;
    }

    return {
      ...point,
      region: extractRegion(item),
    };
  }

  async suggest(addressLine: string, limit = 6): Promise<MarketplaceAddressSuggestion[]> {
    if (addressLine.trim().length < 3) {
      return [];
    }

    const items = await this.fetchItems(addressLine, limit);
    return items
      .map(toAddressSuggestion)
      .filter((suggestion): suggestion is MarketplaceAddressSuggestion => Boolean(suggestion));
  }

  private async fetchItems(addressLine: string, results: number): Promise<DgisItem[]> {
    const apiKey = process.env.DGIS_GEOCODER_API_KEY;
    if (!apiKey || !addressLine.trim()) {
      return [];
    }

    const pageSize = Math.min(Math.max(results, 1), 10);
    const cacheKey = geocoderCacheKey(addressLine, pageSize);
    const cached = await this.redis?.getJson<DgisItem[]>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    try {
      const params = new URLSearchParams({
        q: addressLine.trim(),
        fields: GEOCODER_FIELDS,
        page_size: String(pageSize),
        locale: "ru_RU",
        key: apiKey,
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);
      const response = await fetch(`${GEOCODER_URL}?${params.toString()}`, { signal: controller.signal });
      clearTimeout(timeout);
      // 2ГИС отвечает 404, когда по запросу ничего не найдено — это штатная
      // ситуация автокомплита (промежуточный ввод), не ошибка: тихо отдаём [].
      if (response.status === 404) {
        await this.redis?.setJson(cacheKey, [], GEOCODER_CACHE_EMPTY_TTL_SECONDS);
        return [];
      }
      if (!response.ok) {
        this.logger.warn(`2GIS geocoder responded ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { result?: { items?: DgisItem[] } };
      const items = data.result?.items ?? [];
      await this.redis?.setJson(cacheKey, items, GEOCODER_CACHE_HIT_TTL_SECONDS);
      return items;
    } catch (error) {
      this.logger.warn(`Geocode failed: ${(error as Error).message}`);
      return [];
    }
  }
}

function geocoderCacheKey(addressLine: string, pageSize: number): string {
  const normalized = addressLine.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `${GEOCODER_CACHE_PREFIX}:${pageSize}:${hash}`;
}

function parsePoint(item: DgisItem): Pick<GeocodeResult, "lat" | "lon"> | null {
  // 2ГИС отдаёт координаты явными числами (в отличие от строки "lon lat" Яндекса).
  const lat = Number(item.point?.lat);
  const lon = Number(item.point?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function admName(item: DgisItem, type: string): string | null {
  return item.adm_div?.find((division) => division.type === type)?.name ?? null;
}

function extractRegion(item: DgisItem): string | null {
  return admName(item, "region");
}

// Москва/СПб приходят как city внутри region; обычные города — type "city",
// сёла/посёлки — settlement/place. Берём первое подходящее.
function extractCity(item: DgisItem): string | null {
  return admName(item, "city") ?? admName(item, "settlement") ?? admName(item, "place");
}

function extractStreetBuilding(item: DgisItem): { street: string | null; building: string | null } {
  const component =
    item.address?.components?.find((entry) => entry.type === "street_number") ?? item.address?.components?.[0];
  return {
    street: component?.street ?? null,
    building: component?.number ?? null,
  };
}

function toAddressSuggestion(item: DgisItem): MarketplaceAddressSuggestion | null {
  const value = item.full_name ?? item.address_name ?? item.name;
  const city = extractCity(item);
  if (!value || !city) {
    return null;
  }

  const { street, building } = extractStreetBuilding(item);
  return {
    value,
    address: {
      id: value,
      country: admName(item, "country") ?? "Россия",
      region: extractRegion(item),
      city,
      street,
      building,
      apartment: null,
      postcode: item.address?.postcode ?? null,
      latitude: null,
      longitude: null,
      formatted: value,
      source: "2gis",
    },
  };
}

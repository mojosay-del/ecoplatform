import { createHash } from "crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { MarketplaceAddressSuggestion } from "@ecoplatform/shared";
import { RedisService } from "../redis/redis.service";

export type GeocodeResult = { lat: number; lon: number; region: string | null };

// Страна поиска: ФИАС-данные DaData покрывают РФ (включая новые территории —
// Крым/Севастополь/ДНР/ЛНР/Запорожье/Херсон отдаются как country «Россия»).
// Беларусь геокодится ТОЛЬКО при явном фильтре BY — без него suggest её
// игнорирует и подмешивает РФ-омонимы (Гомель → улица в Москве).
export type GeocodeCountry = "RU" | "BY";

const GEOCODER_TIMEOUT_MS = 3_000;
const SUGGEST_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";
const GEOCODER_CACHE_PREFIX = "geo:dadata:v1";
const GEOCODER_CACHE_HIT_TTL_SECONDS = 7 * 24 * 60 * 60;
const GEOCODER_CACHE_EMPTY_TTL_SECONDS = 24 * 60 * 60;

// Подмножество полей DaData (объект data подсказки) — берём только то, из чего
// собираем адрес/координаты. *_with_type — человекочитаемые («г Донецк»).
type DadataAddressData = {
  country?: string | null;
  region_with_type?: string | null;
  area_with_type?: string | null;
  city_with_type?: string | null;
  settlement_with_type?: string | null;
  street_with_type?: string | null;
  house?: string | null;
  block?: string | null;
  postal_code?: string | null;
  // Координаты приходят строкой; null — когда точность ниже дома (СНТ/район).
  geo_lat?: string | null;
  geo_lon?: string | null;
  fias_id?: string | null;
};
type DadataSuggestion = { value?: string; data?: DadataAddressData };

// Геокодер адресов через DaData Suggestions API (ключ DADATA_API_KEY — секрет
// окружения, в клиент не попадает). Намеренно suggestions, а не clean: подсказки
// возвращают новые территории как Россию и ранжируют омонимы по населённости
// (Донецк → ДНР, а не Ростовская обл.), тогда как clean на голой строке путает.
// Поведение при недоступности graceful: возвращаем null/[], а доменная логика
// сохраняет данные без координат.
@Injectable()
export class AddressGeocoderService {
  private readonly logger = new Logger(AddressGeocoderService.name);

  constructor(@Optional() private readonly redis?: RedisService) {}

  async geocode(addressLine: string, country: GeocodeCountry = "RU"): Promise<GeocodeResult | null> {
    const suggestion = (await this.fetchSuggestions(addressLine, 1, country))[0];
    const point = suggestion ? parsePoint(suggestion) : null;
    if (!point) {
      return null;
    }

    return {
      ...point,
      region: suggestion?.data?.region_with_type ?? null,
    };
  }

  async suggest(
    addressLine: string,
    country: GeocodeCountry = "RU",
    limit = 6,
  ): Promise<MarketplaceAddressSuggestion[]> {
    if (addressLine.trim().length < 3) {
      return [];
    }

    const suggestions = await this.fetchSuggestions(addressLine, limit, country);
    return suggestions
      .map(toAddressSuggestion)
      .filter((suggestion): suggestion is MarketplaceAddressSuggestion => Boolean(suggestion));
  }

  private async fetchSuggestions(
    addressLine: string,
    count: number,
    country: GeocodeCountry,
  ): Promise<DadataSuggestion[]> {
    const apiKey = process.env.DADATA_API_KEY;
    if (!apiKey || !addressLine.trim()) {
      return [];
    }

    const pageSize = Math.min(Math.max(count, 1), 10);
    const cacheKey = geocoderCacheKey(addressLine, pageSize, country);
    const cached = await this.redis?.getJson<DadataSuggestion[]>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEOCODER_TIMEOUT_MS);
      const response = await fetch(SUGGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({
          query: addressLine.trim(),
          count: pageSize,
          locations: [{ country_iso_code: country }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        this.logger.warn(`DaData suggest responded ${response.status}`);
        return [];
      }

      const data = (await response.json()) as { suggestions?: DadataSuggestion[] };
      const suggestions = data.suggestions ?? [];
      // Пустой ответ — штатная ситуация автокомплита (промежуточный ввод):
      // кэшируем на короткий TTL, непустой — на длинный.
      await this.redis?.setJson(
        cacheKey,
        suggestions,
        suggestions.length ? GEOCODER_CACHE_HIT_TTL_SECONDS : GEOCODER_CACHE_EMPTY_TTL_SECONDS,
      );
      return suggestions;
    } catch (error) {
      this.logger.warn(`Geocode failed: ${(error as Error).message}`);
      return [];
    }
  }
}

// Имя страны из адреса (CompanyAddress.country хранит «Россия»/«Беларусь») →
// ISO-фильтр DaData. Всё, кроме явной Беларуси, считаем РФ.
export function dadataCountryFromName(country?: string | null): GeocodeCountry {
  return country?.trim().toLowerCase().startsWith("бел") ? "BY" : "RU";
}

function geocoderCacheKey(addressLine: string, pageSize: number, country: GeocodeCountry): string {
  const normalized = addressLine.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `${GEOCODER_CACHE_PREFIX}:${country}:${pageSize}:${hash}`;
}

function parsePoint(suggestion: DadataSuggestion): Pick<GeocodeResult, "lat" | "lon"> | null {
  // geo_lat/geo_lon — строки либо null (Number(null) === 0, поэтому проверяем
  // наличие сырых значений до приведения).
  const latRaw = suggestion.data?.geo_lat;
  const lonRaw = suggestion.data?.geo_lon;
  if (!latRaw || !lonRaw) {
    return null;
  }
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

// Населённый пункт: город → посёлок/СНТ → район → регион (для сельских адресов
// city_with_type часто null, но форме нужен непустой city).
function extractCity(data: DadataAddressData): string | null {
  return data.city_with_type ?? data.settlement_with_type ?? data.area_with_type ?? data.region_with_type ?? null;
}

function extractBuilding(data: DadataAddressData): string | null {
  return (
    [data.house, data.block]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(", ") || null
  );
}

function toAddressSuggestion(suggestion: DadataSuggestion): MarketplaceAddressSuggestion | null {
  const value = suggestion.value?.trim();
  const data = suggestion.data;
  if (!value || !data) {
    return null;
  }

  const city = extractCity(data);
  if (!city) {
    return null;
  }

  return {
    value,
    address: {
      id: data.fias_id ?? value,
      country: data.country ?? "Россия",
      region: data.region_with_type ?? null,
      city,
      street: data.street_with_type ?? null,
      building: extractBuilding(data),
      apartment: null,
      postcode: data.postal_code ?? null,
      // Координаты подсказки сохраняем в адрес — чтобы поток мог не ре-геокодить.
      latitude: data.geo_lat ?? null,
      longitude: data.geo_lon ?? null,
      formatted: value,
      source: "dadata",
    },
  };
}

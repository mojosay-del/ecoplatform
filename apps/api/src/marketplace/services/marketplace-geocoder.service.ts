import { Injectable, Logger } from "@nestjs/common";
import type { MarketplaceAddressSuggestion } from "@ecoplatform/shared";

export type GeocodeResult = { lat: number; lon: number; region: string | null };

type YandexGeoObject = {
  name?: string;
  description?: string;
  Point?: { pos?: string };
  metaDataProperty?: {
    GeocoderMetaData?: {
      text?: string;
      Address?: {
        formatted?: string;
        postal_code?: string;
        Components?: Array<{ kind?: string; name?: string }>;
      };
      AddressDetails?: {
        Country?: { AdministrativeArea?: { AdministrativeAreaName?: string } };
      };
    };
  };
};

// Геокодер адресов через Яндекс HTTP Geocoder (ключ — секрет окружения
// YANDEX_GEOCODER_API_KEY, в клиент не попадает). Поведение при недоступности —
// graceful: возвращаем null, объявление сохраняется без координат (без круга на
// карте), как требует docs/08-architecture/maps-provider.md, раздел 8.2.
@Injectable()
export class MarketplaceGeocoderService {
  private readonly logger = new Logger(MarketplaceGeocoderService.name);

  async geocode(addressLine: string): Promise<GeocodeResult | null> {
    const geoObjects = await this.fetchGeoObjects(addressLine, 1);
    const geoObject = geoObjects[0];
    if (!geoObject) {
      return null;
    }

    const point = parsePoint(geoObject);
    if (!point) {
      return null;
    }

    return {
      ...point,
      region: extractRegion(geoObject),
    };
  }

  async suggest(addressLine: string, limit = 6): Promise<MarketplaceAddressSuggestion[]> {
    if (addressLine.trim().length < 3) {
      return [];
    }

    const geoObjects = await this.fetchGeoObjects(addressLine, limit);
    return geoObjects
      .map(toAddressSuggestion)
      .filter((suggestion): suggestion is MarketplaceAddressSuggestion => Boolean(suggestion));
  }

  private async fetchGeoObjects(addressLine: string, results: number): Promise<YandexGeoObject[]> {
    const apiKey = process.env.YANDEX_GEOCODER_API_KEY;
    if (!apiKey || !addressLine.trim()) {
      return [];
    }

    try {
      const limit = Math.min(Math.max(results, 1), 10);
      const url =
        `https://geocode-maps.yandex.ru/1.x/?format=json&results=${limit}&lang=ru_RU` +
        `&apikey=${encodeURIComponent(apiKey)}&geocode=${encodeURIComponent(addressLine.trim())}`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Yandex geocoder responded ${response.status}`);
        return [];
      }

      const data = (await response.json()) as {
        response?: { GeoObjectCollection?: { featureMember?: Array<{ GeoObject?: YandexGeoObject }> } };
      };
      return (
        data.response?.GeoObjectCollection?.featureMember
          ?.map((item) => item.GeoObject)
          .filter((geoObject): geoObject is YandexGeoObject => Boolean(geoObject)) ?? []
      );
    } catch (error) {
      this.logger.warn(`Geocode failed: ${(error as Error).message}`);
      return [];
    }
  }
}

function parsePoint(geoObject: YandexGeoObject): Pick<GeocodeResult, "lat" | "lon"> | null {
  const pos = geoObject.Point?.pos;
  if (!pos) {
    return null;
  }

  // Яндекс отдаёт "долгота широта".
  const [lonRaw, latRaw] = pos.split(" ");
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function extractRegion(geoObject: YandexGeoObject): string | null {
  const components = geoObject.metaDataProperty?.GeocoderMetaData?.Address?.Components ?? [];
  const province = components.find((component) => component.kind === "province")?.name;
  if (province) return province;

  return (
    geoObject.metaDataProperty?.GeocoderMetaData?.AddressDetails?.Country?.AdministrativeArea?.AdministrativeAreaName ??
    null
  );
}

function componentName(geoObject: YandexGeoObject, kind: string): string | null {
  return (
    geoObject.metaDataProperty?.GeocoderMetaData?.Address?.Components?.find((component) => component.kind === kind)
      ?.name ?? null
  );
}

function toAddressSuggestion(geoObject: YandexGeoObject): MarketplaceAddressSuggestion | null {
  const meta = geoObject.metaDataProperty?.GeocoderMetaData;
  const value =
    meta?.text ?? meta?.Address?.formatted ?? [geoObject.description, geoObject.name].filter(Boolean).join(", ");
  const city = componentName(geoObject, "locality");
  if (!value || !city) {
    return null;
  }

  return {
    value,
    address: {
      id: value,
      country: componentName(geoObject, "country") ?? "Россия",
      region: extractRegion(geoObject),
      city,
      street: componentName(geoObject, "street"),
      building: componentName(geoObject, "house"),
      apartment: null,
      postcode: meta?.Address?.postal_code ?? null,
      latitude: null,
      longitude: null,
      formatted: value,
      source: "yandex",
    },
  };
}

import { Injectable, Logger } from "@nestjs/common";

export type GeocodeResult = { lat: number; lon: number; region: string | null };

type YandexGeoObject = {
  Point?: { pos?: string };
  metaDataProperty?: {
    GeocoderMetaData?: {
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
    const apiKey = process.env.YANDEX_GEOCODER_API_KEY;
    if (!apiKey || !addressLine.trim()) {
      return null;
    }

    try {
      const url =
        "https://geocode-maps.yandex.ru/1.x/?format=json&results=1&lang=ru_RU" +
        `&apikey=${encodeURIComponent(apiKey)}&geocode=${encodeURIComponent(addressLine.trim())}`;
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Yandex geocoder responded ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        response?: { GeoObjectCollection?: { featureMember?: Array<{ GeoObject?: YandexGeoObject }> } };
      };
      const geoObject = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
      const pos = geoObject?.Point?.pos;
      if (!pos) {
        return null;
      }

      // Яндекс отдаёт "долгота широта".
      const [lonRaw, latRaw] = pos.split(" ");
      const lat = Number(latRaw);
      const lon = Number(lonRaw);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const region =
        geoObject?.metaDataProperty?.GeocoderMetaData?.AddressDetails?.Country?.AdministrativeArea
          ?.AdministrativeAreaName ?? null;
      return { lat, lon, region };
    } catch (error) {
      this.logger.warn(`Geocode failed: ${(error as Error).message}`);
      return null;
    }
  }
}

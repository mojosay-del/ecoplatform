import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisService } from "../../redis/redis.service";
import { MarketplaceGeocoderService } from "./marketplace-geocoder.service";
import { dadataCountryFromName } from "../../geo/address-geocoder.service";

describe("MarketplaceGeocoderService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DADATA_API_KEY;
  });

  it("собирает варианты адреса из ответа DaData (новая территория → country «Россия»)", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await new MarketplaceGeocoderService().suggest("мелитополь богдана", "RU", 6);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("suggestions.dadata.ru");
    expect(init.headers.Authorization).toBe("Token test-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ count: 6, locations: [{ country_iso_code: "RU" }] });
    expect(suggestions).toEqual([
      {
        value: "г Мелитополь, пр-кт Богдана Хмельницкого, д 20",
        address: {
          id: "f7830e76-0cea-4492-affe-227906f576fb",
          country: "Россия",
          region: "Запорожская обл",
          city: "г Мелитополь",
          street: "пр-кт Богдана Хмельницкого",
          building: "20",
          apartment: null,
          postcode: "272312",
          latitude: "46.845205",
          longitude: "35.373295",
          formatted: "г Мелитополь, пр-кт Богдана Хмельницкого, д 20",
          source: "dadata",
        },
      },
    ]);
  });

  it("для Беларуси передаёт фильтр страны BY", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await new MarketplaceGeocoderService().suggest("брестская каменецкий", "BY", 6);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.locations).toEqual([{ country_iso_code: "BY" }]);
  });

  it("отдаёт населённый пункт сельского адреса, когда city_with_type пуст", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            value: "Ленинградская обл, Гатчинский р-н, тер. СНТ Берёзка",
            data: {
              country: "Россия",
              region_with_type: "Ленинградская обл",
              area_with_type: "Гатчинский р-н",
              city_with_type: null,
              settlement_with_type: "тер. СНТ Берёзка",
              geo_lat: null,
              geo_lon: null,
              fias_id: "6a114dee-6b8c-4563-976b-927cdafc60ff",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const [suggestion] = await new MarketplaceGeocoderService().suggest("снт берёзка", "RU", 6);
    expect(suggestion.address.city).toBe("тер. СНТ Берёзка");
    expect(suggestion.address.latitude).toBeNull();
  });

  it("geocode возвращает координаты и регион первой подсказки", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MarketplaceGeocoderService().geocode("мелитополь")).resolves.toEqual({
      lat: 46.845205,
      lon: 35.373295,
      region: "Запорожская обл",
    });
  });

  it("geocode возвращает null, когда у подсказки нет координат", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ value: "Беларусь, Минск", data: { geo_lat: null, geo_lon: null } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MarketplaceGeocoderService().geocode("минск")).resolves.toBeNull();
  });

  it("не ходит во внешний API для короткого запроса или пустого ключа", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MarketplaceGeocoderService().suggest("мс")).resolves.toEqual([]);
    await expect(new MarketplaceGeocoderService().suggest("Москва")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("берёт повторный одинаковый запрос из Redis-кэша без второго вызова DaData", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await service.suggest(" Мелитополь   Богдана ", "RU", 6);
    await service.suggest("мелитополь богдана", "RU", 6);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledWith(
      expect.stringMatching(/^geo:dadata:v1:RU:6:[a-f0-9]{64}$/),
      expect.any(Array),
      7 * 24 * 60 * 60,
    );
    expect(redis.setJson.mock.calls[0][0]).not.toContain("мелитополь");
  });

  it("разделяет кэш по стране и page_size", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await service.geocode("Мелитополь", "RU");
    await service.suggest("Мелитополь", "BY", 6);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.setJson.mock.calls.map(([key]) => key)).toEqual([
      expect.stringMatching(/^geo:dadata:v1:RU:1:[a-f0-9]{64}$/),
      expect.stringMatching(/^geo:dadata:v1:BY:6:[a-f0-9]{64}$/),
    ]);
  });

  it("кэширует пустой ответ на короткий TTL", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await expect(service.suggest("несуществующий адрес")).resolves.toEqual([]);
    await expect(service.suggest("несуществующий адрес")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledWith(expect.any(String), [], 24 * 60 * 60);
  });

  it("не кэширует не-2xx ответы геокодера", async () => {
    process.env.DADATA_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await expect(service.suggest("Москва")).resolves.toEqual([]);
    await expect(service.suggest("Москва")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.setJson).not.toHaveBeenCalled();
  });

  it("dadataCountryFromName: Беларусь → BY, остальное → RU", () => {
    expect(dadataCountryFromName("Беларусь")).toBe("BY");
    expect(dadataCountryFromName("Россия")).toBe("RU");
    expect(dadataCountryFromName(null)).toBe("RU");
    expect(dadataCountryFromName(undefined)).toBe("RU");
  });
});

function createRedisMock() {
  const values = new Map<string, unknown>();
  return {
    getJson: vi.fn(async (key: string) => (values.has(key) ? values.get(key) : null)),
    setJson: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
}

function geocoderResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      suggestions: [
        {
          value: "г Мелитополь, пр-кт Богдана Хмельницкого, д 20",
          data: {
            country: "Россия",
            country_iso_code: "RU",
            region_with_type: "Запорожская обл",
            area_with_type: null,
            city_with_type: "г Мелитополь",
            settlement_with_type: null,
            street_with_type: "пр-кт Богдана Хмельницкого",
            house: "20",
            block: null,
            postal_code: "272312",
            geo_lat: "46.845205",
            geo_lon: "35.373295",
            fias_id: "f7830e76-0cea-4492-affe-227906f576fb",
            fias_level: "8",
          },
        },
      ],
    }),
  };
}

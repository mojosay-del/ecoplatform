import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisService } from "../../redis/redis.service";
import { MarketplaceGeocoderService } from "./marketplace-geocoder.service";

describe("MarketplaceGeocoderService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DGIS_GEOCODER_API_KEY;
  });

  it("собирает варианты адреса из ответа 2ГИС-геокодера", async () => {
    process.env.DGIS_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          items: [
            {
              name: "Тверская улица, 1",
              address_name: "Тверская улица, 1",
              full_name: "Россия, Москва, Тверская улица, 1",
              point: { lat: 55.755864, lon: 37.617698 },
              adm_div: [
                { type: "country", name: "Россия" },
                { type: "region", name: "Москва" },
                { type: "city", name: "Москва" },
              ],
              address: {
                postcode: "125009",
                components: [{ type: "street_number", street: "Тверская улица", number: "1" }],
              },
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await new MarketplaceGeocoderService().suggest("москва тверская", 6);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("catalog.api.2gis.com/3.0/items/geocode"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("page_size=6"), expect.any(Object));
    expect(suggestions).toEqual([
      {
        value: "Россия, Москва, Тверская улица, 1",
        address: {
          id: "Россия, Москва, Тверская улица, 1",
          country: "Россия",
          region: "Москва",
          city: "Москва",
          street: "Тверская улица",
          building: "1",
          apartment: null,
          postcode: "125009",
          latitude: null,
          longitude: null,
          formatted: "Россия, Москва, Тверская улица, 1",
          source: "2gis",
        },
      },
    ]);
  });

  it("не ходит во внешний API для короткого запроса или пустого ключа", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MarketplaceGeocoderService().suggest("мс", 6)).resolves.toEqual([]);
    await expect(new MarketplaceGeocoderService().suggest("Москва", 6)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("берёт повторный одинаковый запрос из Redis-кэша без второго вызова 2ГИС", async () => {
    process.env.DGIS_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await service.suggest(" Москва   Тверская ", 6);
    await service.suggest("москва тверская", 6);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledWith(
      expect.stringMatching(/^geo:2gis:v1:6:[a-f0-9]{64}$/),
      expect.any(Array),
      7 * 24 * 60 * 60,
    );
    expect(redis.setJson.mock.calls[0][0]).not.toContain("москва");
  });

  it("не смешивает кэш геокодинга и подсказок с разным page_size", async () => {
    process.env.DGIS_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(geocoderResponse());
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await expect(service.geocode("Москва")).resolves.toEqual({ lat: 55.755864, lon: 37.617698, region: "Москва" });
    await expect(service.suggest("Москва", 6)).resolves.toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.setJson.mock.calls.map(([key]) => key)).toEqual([
      expect.stringMatching(/^geo:2gis:v1:1:[a-f0-9]{64}$/),
      expect.stringMatching(/^geo:2gis:v1:6:[a-f0-9]{64}$/),
    ]);
  });

  it("кэширует пустой 404-ответ на короткий TTL", async () => {
    process.env.DGIS_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await expect(service.suggest("несуществующий адрес", 6)).resolves.toEqual([]);
    await expect(service.suggest("несуществующий адрес", 6)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redis.setJson).toHaveBeenCalledWith(expect.any(String), [], 24 * 60 * 60);
  });

  it("не кэширует 5xx-ответы геокодера", async () => {
    process.env.DGIS_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    const redis = createRedisMock();
    const service = new MarketplaceGeocoderService(redis as unknown as RedisService);

    await expect(service.suggest("Москва", 6)).resolves.toEqual([]);
    await expect(service.suggest("Москва", 6)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(redis.setJson).not.toHaveBeenCalled();
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
      result: {
        items: [
          {
            name: "Тверская улица, 1",
            address_name: "Тверская улица, 1",
            full_name: "Россия, Москва, Тверская улица, 1",
            point: { lat: 55.755864, lon: 37.617698 },
            adm_div: [
              { type: "country", name: "Россия" },
              { type: "region", name: "Москва" },
              { type: "city", name: "Москва" },
            ],
            address: {
              postcode: "125009",
              components: [{ type: "street_number", street: "Тверская улица", number: "1" }],
            },
          },
        ],
      },
    }),
  };
}

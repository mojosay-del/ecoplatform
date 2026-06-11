import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceGeocoderService } from "./marketplace-geocoder.service";

describe("MarketplaceGeocoderService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.YANDEX_GEOCODER_API_KEY;
  });

  it("собирает варианты адреса из ответа Яндекс-геокодера", async () => {
    process.env.YANDEX_GEOCODER_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          GeoObjectCollection: {
            featureMember: [
              {
                GeoObject: {
                  name: "Тверская улица, 1",
                  description: "Москва, Россия",
                  Point: { pos: "37.617698 55.755864" },
                  metaDataProperty: {
                    GeocoderMetaData: {
                      text: "Россия, Москва, Тверская улица, 1",
                      Address: {
                        postal_code: "125009",
                        Components: [
                          { kind: "country", name: "Россия" },
                          { kind: "province", name: "Москва" },
                          { kind: "locality", name: "Москва" },
                          { kind: "street", name: "Тверская улица" },
                          { kind: "house", name: "1" },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await new MarketplaceGeocoderService().suggest("москва тверская", 6);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("results=6"), expect.any(Object));
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
          source: "yandex",
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
});

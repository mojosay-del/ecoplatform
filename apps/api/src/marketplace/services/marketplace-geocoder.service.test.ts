import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceGeocoderService } from "./marketplace-geocoder.service";

describe("MarketplaceGeocoderService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});

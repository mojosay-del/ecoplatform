import type { MarketplaceAddressSuggestion } from "@ecoplatform/shared";
import { enc } from "./endpoint-utils";
import { apiFetch } from "./requests";

// Общий гео-клиент: подсказки адреса доступны любому авторизованному
// пользователю и НЕ зависят от того, включена ли торговая площадка (форма
// адреса компании в кабинете использует именно этот роут).
export const geoApi = {
  addressSuggest: (q: string, country: "RU" | "BY" = "RU") =>
    apiFetch<MarketplaceAddressSuggestion[]>(`/geo/address-suggest?q=${enc(q)}&country=${country}`),
};

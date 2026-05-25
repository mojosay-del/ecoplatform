// Точка входа в API-слой. Существующие импорты `from "../lib/api"` продолжают
// работать после переезда `api.ts` → `api/core.ts`, потому что index.ts
// реэкспортирует всё то же самое.
//
// Новый код должен импортировать typed-namespace: `import { api } from "../lib/api"`.

export * from "./core";
export { api, type ApiClient, type LikeResult } from "./endpoints";

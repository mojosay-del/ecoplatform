// Общие хелперы и базовые состояния для view-страниц.
// Раньше всё лежало в одном _shared.tsx; теперь разбито по смыслу:
//   comments.tsx      — новости/комментарии (аватары, лайки, форматирование дат)
//   use-api-query.tsx — хук загрузки данных useApiQuery
//   states.tsx        — экраны AuthRequired / AccessClosed / ErrorState / PageHeader
// pluralizeRu живёт в lib/ru-plural (нужен и компонентам админки), реэкспортим
// его здесь для совместимости со старыми импортами view-страниц.
export * from "./comments";
export * from "./use-api-query";
export * from "./states";
export { pluralizeRu } from "../../lib/ru-plural";

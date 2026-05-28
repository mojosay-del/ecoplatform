// Серверная обёртка над общей реализацией. Whitelist живёт в shared,
// чтобы web и api не разъехались по правилам и не оставили дыру XSS.
export { sanitizeParagraphHtml } from "@ecoplatform/shared/sanitize-html";

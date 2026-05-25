// Re-export тонкой обёрткой, чтобы не ломать существующие импорты в компонентах.
// Реальный whitelist и hooks живут в `@ecoplatform/shared/src/sanitize-html.ts`.
export { sanitizeParagraphHtml } from "@ecoplatform/shared";

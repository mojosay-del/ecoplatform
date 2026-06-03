import type { ContentBlockKind } from "@ecoplatform/shared";

// Универсальный блок CMS в терминах админ-экранов. Тип kind берём из единой
// shared-схемы (включает quiz/matching). Хранится и валидируется как и раньше.
export type Block = { type: ContentBlockKind; payload: Record<string, unknown> };

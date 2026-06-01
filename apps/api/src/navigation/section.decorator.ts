import { SetMetadata } from "@nestjs/common";

// Помечает роут ключом раздела меню. Если раздел скрыт админом —
// SectionVisibilityGuard блокирует роут (404) для всех.
export const SECTION_KEY = "nav-section";

export const Section = (guardKey: string) => SetMetadata(SECTION_KEY, guardKey);

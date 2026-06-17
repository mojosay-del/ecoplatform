import type { CompanyType, ForumQuestionStatus } from "@ecoplatform/shared";

// Статус-бейдж: «Решено» (есть принятый ответ) vs «Нужен ответ». hidden — только
// в админ-контексте; в публичной ленте скрытые вопросы не показываются.
export function forumStatusLabel(status: ForumQuestionStatus): string {
  if (status === "solved") return "Решено";
  if (status === "hidden") return "Скрыто";
  return "Нужен ответ";
}

export function forumStatusVariant(status: ForumQuestionStatus): "solved" | "open" | "hidden" {
  if (status === "solved") return "solved";
  if (status === "hidden") return "hidden";
  return "open";
}

// Роль автора = тип его компании (заготовитель/трейдер/переработчик).
export function companyRoleLabel(type: CompanyType | null): string | null {
  if (type === "collector") return "Заготовитель";
  if (type === "trader") return "Трейдер";
  if (type === "processor") return "Переработчик";
  return null;
}

// Инициалы для аватара-заглушки из отображаемого имени («Игорь П.» → «ИП»).
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join("");
}

// Абзацы простого текста (тело вопроса/ответа): разбиваем по переводам строк.
export function bodyParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// Относительное время на русском: «только что», «5 мин», «3 ч», «2 дн», иначе дата.
export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

import type { PlatformRole } from "@ecoplatform/shared";

export type AccountNotificationRow = {
  category: string;
  label: string;
  description: string;
};

export const ACCOUNT_NOTIFICATION_ROWS: AccountNotificationRow[] = [
  {
    category: "security",
    label: "Безопасность",
    description: "Входы, смена пароля и отзыв сессий.",
  },
  {
    category: "billing",
    label: "Биллинг",
    description: "Счета, платежи, документы и статусы подписки.",
  },
  {
    category: "marketplace",
    label: "Торговая площадка",
    description: "Объявления, предложения и статусы сделок.",
  },
  {
    category: "moderation",
    label: "Модерация",
    description: "Решения по жалобам, ограничения и предупреждения.",
  },
  {
    category: "support",
    label: "Поддержка",
    description: "Ответы администратора и статусы обращений.",
  },
  {
    category: "system",
    label: "Системные",
    description: "Правила, обновления и технические работы.",
  },
];

export function accountNotificationRowsForRoles(_roles: PlatformRole[]): AccountNotificationRow[] {
  return ACCOUNT_NOTIFICATION_ROWS;
}

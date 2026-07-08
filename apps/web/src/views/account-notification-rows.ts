import type { PlatformRole } from "@ecoplatform/shared";

export type AccountNotificationRow = {
  category: string;
  label: string;
  description: string;
};

export const ACCOUNT_NOTIFICATION_ROWS: AccountNotificationRow[] = [
  {
    category: "billing",
    label: "Биллинг",
    description: "Счета, платежи, документы и статусы подписки.",
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
    category: "forum",
    label: "Форум",
    description: "Ответы на ваши вопросы и отметки решением.",
  },
];

export function accountNotificationRowsForRoles(_roles: PlatformRole[]): AccountNotificationRow[] {
  return ACCOUNT_NOTIFICATION_ROWS;
}

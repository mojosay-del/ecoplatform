import type {
  CompanyStatus,
  CompanyType,
  ContentStatus,
  LearningAccessLevel,
  PlatformRole,
  SubscriptionPlan,
  SupportTicketCategory,
  SupportTicketStatus,
  UserGender,
  UserStatus,
} from "@ecoplatform/shared";

export const COMPANY_STATUS_LABELS: Record<string, string> = {
  demo: "Демо",
  active: "Активна",
  past_due: "Подписка просрочена",
  suspended: "Приостановлена",
  pending_deletion: "Удаление запланировано",
  blocked: "Заблокирована",
  archived: "В архиве",
} satisfies Record<CompanyStatus, string>;

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  collector: "Заготовитель",
  trader: "Трейдер",
  processor: "Переработчик",
} satisfies Record<CompanyType, string>;

export const USER_STATUS_LABELS: Record<string, string> = {
  active: "Активен",
  blocked: "Заблокирован",
} satisfies Record<UserStatus, string>;

export const USER_GENDER_LABELS: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
} satisfies Record<UserGender, string>;

export const PLATFORM_ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  moderator: "Модератор",
  content_manager: "Контент-менеджер",
} satisfies Record<PlatformRole, string>;

export const PLATFORM_ROLE_SHORT_LABELS: Record<string, string> = {
  admin: "Админ",
  moderator: "Модератор",
  content_manager: "Контент-менеджер",
} satisfies Record<PlatformRole, string>;

export const CONTENT_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  published: "Опубликовано",
} satisfies Record<ContentStatus, string>;

export const LEARNING_ACCESS_LEVEL_LABELS: Record<string, string> = {
  basic: "Базовый доступ",
  extended: "Расширенный доступ",
  one_time: "Разовая покупка",
} satisfies Record<LearningAccessLevel, string>;

export const SUBSCRIPTION_PLAN_LABELS: Record<string, string> = {
  basic: "Базовый",
  extended: "Расширенный",
} satisfies Record<SubscriptionPlan, string>;

export const SUBSCRIPTION_PLAN_TITLE_LABELS: Record<string, string> = {
  basic: "Базовая",
  extended: "Расширенная",
} satisfies Record<SubscriptionPlan, string>;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  past_due: "Просрочена",
  suspended: "Приостановлена",
  cancelled: "Отменена",
  expired: "Истекла",
};

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  new: "Новое",
  open: "Открыт",
  in_progress: "В работе",
  awaiting_user: "Ждёт ответа",
  resolved: "Решён",
  closed: "Закрыт",
} satisfies Record<SupportTicketStatus | "open", string>;

export const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  billing: "Биллинг",
  moderation_review: "Модерация",
  company_management: "Компания",
  technical: "Технический вопрос",
  data_deletion: "Удаление данных",
  other: "Другое",
  marketplace_dispute: "Спор на площадке",
  forum_complaint: "Жалоба на форуме",
  shop_purchase: "Покупка в магазине",
  refund_request: "Возврат средств",
} satisfies Record<
  SupportTicketCategory | "marketplace_dispute" | "forum_complaint" | "shop_purchase" | "refund_request",
  string
>;

export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  security: "Безопасность",
  billing: "Биллинг",
  marketplace: "Площадка",
  moderation: "Модерация",
  support: "Поддержка",
  system: "Система",
  forum: "Форум",
  solutions_shop: "Магазин решений",
  reviews: "Отзывы",
  geo_alert: "Гео-уведомления",
  price_alert: "Ценовые уведомления",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<string, string> = {
  in_app: "В приложении",
  email: "Email",
  sms: "SMS",
  telegram: "Telegram",
  push: "Push",
};

export const STAFF_STATUS_LABELS = {
  active: "Активен",
  inactive: "Деактивирован",
} as const;

export const MODERATION_CASE_STATUS_LABELS: Record<string, string> = {
  open: "Открыт",
  in_review: "В работе",
  resolved: "Решён",
  escalated: "Эскалирован",
  closed_by_admin: "Закрыт администратором",
};

export const MODERATION_DECISION_LABELS: Record<string, string> = {
  leave_as_is: "Оставить без изменений",
  remove_content: "Снять контент",
  warn_company: "Предупредить компанию",
  escalate_to_admin: "Эскалировать администратору",
};

// Санкции, доступные администратору из карточки кейса.
export const ADMIN_SANCTION_TYPE_LABELS: Record<string, string> = {
  user_block: "Блокировка пользователя",
  company_block: "Блокировка компании",
  module_restriction: "Ограничение модуля",
  // На случай отображения исторических санкций других типов:
  warning: "Предупреждение",
  content_removal: "Снятие контента",
};

export const RESTRICTABLE_MODULE_LABELS: Record<string, string> = {
  comments: "Комментарии",
  marketplace: "Площадка",
  reviews: "Отзывы",
};

export const MODERATION_REASON_LABELS: Record<string, string> = {
  valid_complaint: "Жалоба обоснована",
  repeated_violation: "Повторное нарушение",
  unfounded_complaint: "Жалоба необоснована",
  out_of_scope: "Вне компетенции модератора",
  severe_violation: "Серьёзное нарушение",
  other: "Иное",
  policy_violation: "Нарушение правил",
  fraud: "Мошенничество",
  suspicious_activity: "Подозрительная активность",
  support_request: "По запросу поддержки",
  billing_issue: "Биллинг",
  manual_activation: "Ручная активация",
  manual_archive: "Архивирование",
  // Коды причин жалоб (complaintReasonCodes).
  contact_data: "Контактные данные",
  false_information: "Недостоверная информация",
  offensive_content: "Оскорбительный контент",
  spam: "Спам",
  illegal_content: "Запрещённый контент",
};

export const PAYMENT_METHOD_TYPE_LABELS: Record<string, string> = {
  card_tinkoff: "Карта Тинькофф",
  bank_invoice: "Счёт на оплату",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает оплаты",
  succeeded: "Оплачен",
  failed: "Ошибка оплаты",
  refunded: "Возвращён",
};

export const LEGAL_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  privacy_policy: "Политика конфиденциальности",
  terms_of_service: "Пользовательское соглашение",
  personal_data_consent: "Согласие на обработку персональных данных",
  cookie_policy: "Политика cookie",
  marketing_consent: "Маркетинговые согласия",
  offer_agreement: "Оферта",
};

export const CONSENT_SOURCE_LABELS: Record<string, string> = {
  registration: "Регистрация",
  login_reconfirm: "Повторное согласие при входе",
  cookie_banner: "Cookie-баннер",
  settings: "Настройки",
  admin_action: "Действие администратора",
};

export const COMMENT_STATUS_LABELS: Record<string, string> = {
  published: "Опубликован",
  hidden_by_moderator: "Скрыт модератором",
  removed_by_admin: "Удалён администратором",
  removed_with_news: "Удалён вместе с новостью",
};

export const FILE_ACCESS_LEVEL_LABELS: Record<string, string> = {
  public: "Публичный",
  authenticated: "Для авторизованных",
  platform_private: "Служебный",
  conversation_private: "Приватный для переписки",
};

export const ADMIN_AUDIT_FIELD_LABELS: Record<string, string> = {
  status: "Статус",
  subscriptionPlan: "Тариф",
  plan: "Тариф",
  roles: "Роли",
  platformRoles: "Платформенные роли",
  isActive: "Активность",
  reasonCode: "Причина",
  type: "Тип",
  category: "Категория",
  accessLevel: "Уровень доступа",
  commentStatus: "Статус комментария",
  paymentStatus: "Статус платежа",
  paymentMethodType: "Способ оплаты",
};

const AUDIT_ENUM_VALUE_LABELS: Record<string, string> = {
  ...COMPANY_STATUS_LABELS,
  ...USER_STATUS_LABELS,
  ...CONTENT_STATUS_LABELS,
  ...LEARNING_ACCESS_LEVEL_LABELS,
  ...SUBSCRIPTION_PLAN_LABELS,
  ...SUBSCRIPTION_STATUS_LABELS,
  ...SUPPORT_STATUS_LABELS,
  ...SUPPORT_CATEGORY_LABELS,
  ...NOTIFICATION_CATEGORY_LABELS,
  ...NOTIFICATION_CHANNEL_LABELS,
  ...STAFF_STATUS_LABELS,
  ...MODERATION_CASE_STATUS_LABELS,
  ...MODERATION_DECISION_LABELS,
  ...MODERATION_REASON_LABELS,
  ...PAYMENT_METHOD_TYPE_LABELS,
  ...PAYMENT_STATUS_LABELS,
  ...LEGAL_DOCUMENT_TYPE_LABELS,
  ...CONSENT_SOURCE_LABELS,
  ...COMMENT_STATUS_LABELS,
  ...FILE_ACCESS_LEVEL_LABELS,
};

export function labelFromMap(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "—";
  return map[value] ?? value;
}

export function formatPlatformRoles(roles: readonly string[]): string {
  if (roles.length === 0) return "—";
  return roles.map((role) => PLATFORM_ROLE_SHORT_LABELS[role] ?? role).join(", ");
}

export function formatAuditFieldLabel(key: string): string {
  return ADMIN_AUDIT_FIELD_LABELS[key] ?? key;
}

export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";

  if (Array.isArray(value)) {
    return value.length ? value.map((item) => formatAuditValue(key, item)).join(", ") : "[]";
  }

  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (!value) return '""';
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("role")) return PLATFORM_ROLE_SHORT_LABELS[value] ?? value;
    if (lowerKey.includes("company") && lowerKey.includes("status")) return COMPANY_STATUS_LABELS[value] ?? value;
    if (lowerKey.includes("user") && lowerKey.includes("status")) return USER_STATUS_LABELS[value] ?? value;
    if (lowerKey.includes("subscription") && lowerKey.includes("status")) {
      return SUBSCRIPTION_STATUS_LABELS[value] ?? value;
    }
    if (lowerKey.includes("plan")) return SUBSCRIPTION_PLAN_LABELS[value] ?? value;
    if (lowerKey.includes("support") || lowerKey.includes("ticket")) {
      return SUPPORT_STATUS_LABELS[value] ?? SUPPORT_CATEGORY_LABELS[value] ?? value;
    }
    if (lowerKey.includes("moderation") || lowerKey.includes("decision")) {
      return MODERATION_DECISION_LABELS[value] ?? MODERATION_CASE_STATUS_LABELS[value] ?? value;
    }
    if (lowerKey.includes("reason")) return MODERATION_REASON_LABELS[value] ?? value;
    if (lowerKey.includes("category"))
      return SUPPORT_CATEGORY_LABELS[value] ?? NOTIFICATION_CATEGORY_LABELS[value] ?? value;
    if (lowerKey.includes("access"))
      return LEARNING_ACCESS_LEVEL_LABELS[value] ?? FILE_ACCESS_LEVEL_LABELS[value] ?? value;
    return AUDIT_ENUM_VALUE_LABELS[value] ?? value;
  }

  return JSON.stringify(value);
}

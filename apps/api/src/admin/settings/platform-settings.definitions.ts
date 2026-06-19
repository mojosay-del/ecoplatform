import { z } from "zod";

export const platformSettingDefinitions = {
  "auth.registration_enabled": {
    label: "Регистрация новых пользователей",
    description:
      "Когда выключено — публичная форма регистрации недоступна, и попытки создать аккаунт отклоняются. Уже зарегистрированные пользователи продолжают входить как обычно. Удобно на время разработки MVP.",
    schema: z.boolean(),
    default: true,
  },
  "moderation.lock_duration_minutes": {
    label: "Время удержания кейса модератором",
    description: "Сколько минут кейс модерации закреплён за модератором, прежде чем lock автоматически снимется.",
    schema: z.number().int().min(1).max(120),
    default: 15,
  },
  "moderation.max_locks_per_moderator": {
    label: "Максимум активных кейсов на модератора",
    description: "Сколько кейсов модератор может одновременно держать в работе.",
    schema: z.number().int().min(1).max(20),
    default: 3,
  },
  "demo.enabled": {
    label: "Пробный доступ на странице подписки",
    description:
      "Когда выключено — карточка пробного доступа остаётся видимой, но самостоятельная активация отклоняется. Уже выданные пробные доступы это не затрагивает.",
    schema: z.boolean(),
    default: true,
  },
  "demo.duration_hours": {
    label: "Длительность пробного доступа (часов)",
    description: "Сколько часов компания пользуется пробным доступом после выбора карточки на странице подписки.",
    schema: z.number().int().min(1).max(8760),
    default: 24,
  },
  "support.new_tickets_enabled": {
    label: "Приём новых обращений в поддержку",
    description:
      "Когда выключено — пользователи не могут создавать новые обращения (например, при завале). Переписка по уже открытым тикетам продолжается как обычно.",
    schema: z.boolean(),
    default: true,
  },
  "discussions.enabled": {
    label: "Комментарии к новостям",
    description:
      "Когда выключено — пользователи не могут оставлять новые комментарии (стоп-кран при спаме или атаке). Уже опубликованные комментарии остаются видимыми.",
    schema: z.boolean(),
    default: true,
  },
  "marketplace.enabled": {
    label: "Торговая площадка",
    description:
      "Когда выключено — раздел скрыт из меню и API площадки недоступен всем пользователям, включая персонал. Данные объявлений, предложений и отзывов сохраняются.",
    schema: z.boolean(),
    default: false,
  },
  "indices.stagnation_threshold_percent": {
    label: "Порог стагнации индексов (%)",
    description: "Если недельное изменение цены меньше этого порога по модулю — индекс показывает «стагнацию».",
    schema: z.number().min(0).max(50),
    default: 1,
  },
  "security.login_lockout_threshold": {
    label: "Порог блокировки входа (попыток)",
    description:
      "Сколько неудачных попыток входа подряд (в пределах окна ниже) приводит к временной блокировке учётной записи. Минимум 3, чтобы случайно не отключить защиту от перебора пароля.",
    schema: z.number().int().min(3).max(50),
    default: 10,
  },
  "security.login_lockout_window_minutes": {
    label: "Окно подсчёта попыток входа (минут)",
    description:
      "За какой период считаются неудачные попытки. По истечении окна без новых ошибок счётчик сбрасывается.",
    schema: z.number().int().min(1).max(1440),
    default: 15,
  },
  "security.login_lockout_duration_minutes": {
    label: "Длительность блокировки входа (минут)",
    description: "На сколько минут блокируется вход после превышения порога неудачных попыток.",
    schema: z.number().int().min(1).max(1440),
    default: 15,
  },
  "security.pwned_check_enabled": {
    label: "Проверять пароли по базе утечек",
    description:
      "Когда включено — новые пароли проверяются по базе Have I Been Pwned (k-anonymity, без отправки пароля). Если внешний сервис недоступен, регистрация не блокируется.",
    schema: z.boolean(),
    default: true,
  },
  "files.max_upload_mb": {
    label: "Максимальный размер файла (МБ)",
    description: "Предельный размер одного загружаемого файла.",
    schema: z.number().int().min(1).max(1024),
    default: 100,
  },
  "files.max_cover_mb": {
    label: "Максимальный размер обложки (МБ)",
    description: "Предельный размер изображения-обложки (для новостей, курсов и статей).",
    schema: z.number().int().min(1).max(100),
    default: 10,
  },
  "files.daily_quota_mb": {
    label: "Дневная квота загрузок на компанию (МБ)",
    description: "Сколько мегабайт компания может загрузить за сутки суммарно. Защита от исчерпания хранилища.",
    schema: z.number().int().min(1).max(102400),
    default: 500,
  },
} as const;

export type PlatformSettingKey = keyof typeof platformSettingDefinitions;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.infer<
  (typeof platformSettingDefinitions)[K]["schema"]
>;

export const platformSettingKeys = Object.keys(platformSettingDefinitions) as PlatformSettingKey[];

export const platformSettingUpdateBodySchema = z
  .object({
    value: z.unknown(),
  })
  .refine((body) => body.value !== undefined, {
    message: "Нужно передать поле value.",
    path: ["value"],
  });

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return (platformSettingKeys as string[]).includes(value);
}

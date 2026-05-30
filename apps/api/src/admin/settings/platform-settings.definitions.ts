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
  "demo.duration_hours": {
    label: "Длительность демо-периода (часов)",
    description: "Сколько часов компания пользуется демо-доступом после регистрации.",
    schema: z.number().int().min(1).max(8760),
    default: 24,
  },
  "indices.stagnation_threshold_percent": {
    label: "Порог стагнации индексов (%)",
    description: "Если недельное изменение цены меньше этого порога по модулю — индекс показывает «стагнацию».",
    schema: z.number().min(0).max(50),
    default: 1,
  },
} as const;

export type PlatformSettingKey = keyof typeof platformSettingDefinitions;
export type PlatformSettingValue<K extends PlatformSettingKey> = z.infer<
  (typeof platformSettingDefinitions)[K]["schema"]
>;

export const platformSettingKeys = Object.keys(platformSettingDefinitions) as PlatformSettingKey[];

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return (platformSettingKeys as string[]).includes(value);
}

// Форматтеры и визуальные подсказки дашборда: числа, даты, «N мин назад»,
// человекочитаемые названия действий аудита и иконка/тон для события.

import type { AdminDashboardSummary, AdminJournalActor } from "@ecoplatform/shared";
import {
  Activity,
  CreditCard,
  Eye,
  EyeOff,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Trash2,
  Unlock,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { AuditTone, HealthKey, KpiPolarity } from "./types";

export const NUMBER_FORMAT = new Intl.NumberFormat("ru-RU");
export const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });
export const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
export const TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

const ACTION_LABELS: Record<string, string> = {
  "admin.company.status": "Статус компании изменён",
  "admin.legal.document.create": "Юридический документ создан",
  "admin.legal.document.publish": "Юридический документ опубликован",
  "admin.setting.update": "Настройка изменена",
  "admin.staff.create": "Сотрудник добавлен",
  "admin.staff.update": "Сотрудник обновлён",
  "admin.user.block": "Пользователь заблокирован",
  "admin.user.platform_roles": "Роли пользователя изменены",
  "admin.user.unblock": "Пользователь разблокирован",
  "indices.category.create": "Категория индексов создана",
  "indices.category.delete": "Категория индексов удалена",
  "indices.category.update": "Категория индексов обновлена",
  "indices.index.create": "Индекс создан",
  "indices.index.delete": "Индекс удалён",
  "indices.index.publish": "Индекс опубликован",
  "indices.index.unpublish": "Индекс снят с публикации",
  "indices.nomenclature.create": "Номенклатура создана",
  "indices.nomenclature.delete": "Номенклатура удалена",
  "indices.nomenclature.update": "Номенклатура обновлена",
  "indices.value.delete": "Значение индекса удалено",
  "knowledge.create": "Статья базы знаний создана",
  "knowledge.delete": "Статья базы знаний удалена",
  "knowledge.move": "Статья базы знаний перемещена",
  "knowledge.publish": "Статья базы знаний опубликована",
  "knowledge.unpublish": "Статья базы знаний снята с публикации",
  "knowledge.update": "Статья базы знаний обновлена",
  "learning.chapter.create": "Глава курса создана",
  "learning.chapter.delete": "Глава курса удалена",
  "learning.chapter.update": "Глава курса обновлена",
  "learning.lesson.create": "Урок создан",
  "learning.lesson.delete": "Урок удалён",
  "learning.lesson.publish": "Урок опубликован",
  "learning.lesson.unpublish": "Урок снят с публикации",
  "learning.lesson.update": "Урок обновлён",
  "learning.module.create": "Курс создан",
  "learning.module.delete": "Курс удалён",
  "learning.module.publish": "Курс опубликован",
  "learning.module.unpublish": "Курс снят с публикации",
  "learning.module.update": "Курс обновлён",
  manual_subscription_activation: "Подписка активирована вручную",
  self_subscription_activation: "Подписка выбрана пользователем",
  "moderation.admin_sanction.module_restriction": "Ограничение модуля применено",
  "moderation.case.lock": "Кейс модерации взят в работу",
  "moderation.case.release": "Кейс модерации освобождён",
  "news.create": "Новость создана",
  "news.delete": "Новость удалена",
  "news.publish": "Новость опубликована",
  "news.unpublish": "Новость снята с публикации",
  "news.update": "Новость обновлена",
};

export function formatNumber(value: number) {
  return NUMBER_FORMAT.format(value);
}

export function formatRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "только что";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return DATE_FORMAT.format(date);
}

export function formatAction(action: string) {
  return ACTION_LABELS[action] ?? "Событие журнала";
}

export function formatActor(actor: AdminJournalActor | null) {
  if (!actor) return "Системное действие";
  const name = [actor.firstName, actor.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || actor.email;
}

export function formatHealthStatus(status: AdminDashboardSummary["systemHealth"][HealthKey]) {
  if (status === "ok") return "В порядке";
  if (status === "disabled") return "Не настроено";
  return "Нужна проверка";
}

export function deltaTone(delta: number, polarity: KpiPolarity): "good" | "bad" | "flat" {
  if (delta === 0) return "flat";
  const positiveIsGood = polarity !== "up-bad";
  const isGood = delta > 0 ? positiveIsGood : !positiveIsGood;
  return isGood ? "good" : "bad";
}

export function auditVisual(action: string): { icon: LucideIcon; tone: AuditTone } {
  if (action.endsWith(".delete")) return { icon: Trash2, tone: "danger" };
  if (action.includes("unpublish")) return { icon: EyeOff, tone: "neutral" };
  if (action.includes("publish")) return { icon: Eye, tone: "publish" };
  if (action.endsWith(".create")) return { icon: Plus, tone: "create" };
  if (action.includes("user.block")) return { icon: LockKeyhole, tone: "danger" };
  if (action.includes("user.unblock")) return { icon: Unlock, tone: "publish" };
  if (action.includes("platform_roles") || action.includes("staff")) return { icon: UserCog, tone: "security" };
  if (action.includes("subscription")) return { icon: CreditCard, tone: "create" };
  if (action.includes("moderation")) return { icon: ShieldAlert, tone: "danger" };
  if (action.includes("setting")) return { icon: Settings2, tone: "security" };
  if (action.includes("status")) return { icon: RefreshCw, tone: "update" };
  if (action.includes("update") || action.includes("move")) return { icon: Pencil, tone: "update" };
  return { icon: Activity, tone: "neutral" };
}

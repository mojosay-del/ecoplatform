import {
  Activity,
  CalendarClock,
  CreditCard,
  Database,
  HardDrive,
  Headphones,
  LockKeyhole,
  Server,
  ShieldAlert,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { HealthKey, KpiKey, KpiPolarity, KpiTone, KpiTrendKey, OperationKey } from "./types";

export const KPI_CARDS: Array<{
  key: KpiKey;
  label: string;
  hint: string;
  href: string;
  tone: KpiTone;
  icon: LucideIcon;
  trendKey?: KpiTrendKey;
  polarity?: KpiPolarity;
}> = [
  {
    key: "activeUsersToday",
    label: "Пользователей сегодня",
    hint: "Уникальные активные сессии",
    href: "/admin/users",
    tone: "info",
    icon: Activity,
    trendKey: "activeUsersToday",
    polarity: "up-good",
  },
  {
    key: "registrationsToday",
    label: "Регистраций сегодня",
    hint: "Новые учётные записи",
    href: "/admin/users",
    tone: "brand",
    icon: UserPlus,
    trendKey: "registrationsToday",
    polarity: "up-good",
  },
  {
    key: "activeSubscriptions",
    label: "Активных подписок",
    hint: "Оплаченный доступ сейчас",
    href: "/admin/companies",
    tone: "success",
    icon: CreditCard,
    trendKey: "activeSubscriptions",
    polarity: "up-good",
  },
  {
    key: "subscriptionsExpiringSoon",
    label: "Истекают за 7 дней",
    hint: "Подписки на продление",
    href: "/admin/companies",
    tone: "warning",
    icon: CalendarClock,
  },
  {
    key: "openModerationCases",
    label: "Открытых жалоб",
    hint: "Кейсы требуют решения",
    href: "/admin/moderation",
    tone: "danger",
    icon: ShieldAlert,
  },
  {
    key: "activeSupportTickets",
    label: "Активных тикетов",
    hint: "Новые и в работе",
    href: "/admin/support",
    tone: "warning",
    icon: Headphones,
  },
];

export const OPERATION_CARDS: Array<{
  key: OperationKey;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    key: "pendingDeletionRequests",
    label: "Запросы на удаление",
    hint: "Пользователи ждут обработки",
    href: "/admin/users",
    icon: Trash2,
  },
  {
    key: "pastDueCompanies",
    label: "Просрочка оплаты",
    hint: "Компании в статусе past due",
    href: "/admin/companies",
    icon: CalendarClock,
  },
  {
    key: "lockedAccounts",
    label: "Временные блокировки",
    hint: "Аккаунты после неудачных входов",
    href: "/admin/users",
    icon: LockKeyhole,
  },
];

export const HEALTH_DEPENDENCIES: Array<{
  key: HealthKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { key: "database", label: "Postgres", hint: "Основная база данных", icon: Database },
  { key: "redis", label: "Redis", hint: "Кэш сессий и лимитов", icon: Server },
  { key: "storage", label: "S3", hint: "Файлы и изображения", icon: HardDrive },
];

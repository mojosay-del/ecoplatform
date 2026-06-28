import { SUBSCRIPTION_PLAN_TITLE_LABELS } from "../../lib/display-labels";
import { formatDateTime } from "../../lib/formatters";

// Приветствие по времени суток. Значение по умолчанию ("Добрый день")
// одинаково на сервере и при первом клиентском рендере — гидратация не рвётся,
// а точное приветствие подставляется уже в useEffect после монтирования.
export function accountGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function describeSubscription(
  billing: {
    status?: string;
    subscriptionPlan?: string | null;
    demoEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
  } | null,
) {
  if (!billing) {
    return { tariff: "не активирован", note: "Подписка не активна" };
  }
  if (billing.status === "demo") {
    const endsAt = billing.demoEndsAt ? new Date(billing.demoEndsAt) : null;
    const expired = endsAt ? endsAt.getTime() <= Date.now() : false;
    return {
      tariff: endsAt ? "Пробный" : "Доступ не выбран",
      note: endsAt
        ? expired
          ? `Пробный доступ истёк ${formatAccountDateTime(endsAt)}. Активируйте подписку.`
          : `Пробный доступ до ${formatAccountDateTime(endsAt)}`
        : "Выберите пробный доступ или подписку.",
    };
  }
  if (billing.status === "active" && billing.subscriptionPlan) {
    const endsAt = billing.subscriptionEndsAt ? new Date(billing.subscriptionEndsAt) : null;
    return {
      tariff: SUBSCRIPTION_PLAN_TITLE_LABELS[billing.subscriptionPlan] ?? billing.subscriptionPlan,
      note: endsAt ? `Действует до ${formatAccountDateTime(endsAt)}` : "Подписка активна",
    };
  }
  if (billing.status === "past_due")
    return { tariff: "Подписка просрочена", note: "Свяжитесь с поддержкой для продления." };
  if (billing.status === "suspended") return { tariff: "Приостановлена", note: "Доступ к разделам временно закрыт." };
  if (billing.status === "pending_deletion")
    return { tariff: "Удаление запланировано", note: "Доступ к функциональным разделам закрыт до отмены запроса." };
  if (billing.status === "blocked") return { tariff: "Заблокирована", note: "Компания заблокирована." };
  return { tariff: "не активирован", note: "Подписка не активна" };
}

export function formatAccountDateTime(value?: string | Date | null) {
  return formatDateTime(value);
}

export function formatAccountDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

export function describeSessionDevice(userAgent?: string | null) {
  if (!userAgent) return "Неизвестное устройство";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Браузер";
  const os = /Windows NT/i.test(userAgent)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(userAgent)
      ? "macOS"
      : /Android/i.test(userAgent)
        ? "Android"
        : /iPhone|iPad/i.test(userAgent)
          ? "iOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "ОС";
  return `${browser} · ${os}`;
}

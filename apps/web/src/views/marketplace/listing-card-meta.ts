// Производные данные карточки объявления: срок истечения, расстояние, свежесть.
// Чистые функции без DOM — тестируются в listing-card-meta.test.ts. Используются
// карточкой ленты, модалкой (бейдж истечения) и картой (пульс свежих).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Порог бейджа «истекает скоро» на карточке.
export const LISTING_EXPIRING_SOON_DAYS = 3;

// Объявление считается свежим (пульс на карте) первые сутки после публикации.
export const LISTING_FRESH_HOURS = 24;

function parseDate(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

// Сколько дней осталось до истечения (округление вверх: остаток в 4 часа —
// это «1 день»). null — дата не задана/невалидна; 0 — уже истекло.
export function daysUntilExpiry(expiresAt: string | null, now: number = Date.now()): number | null {
  const timestamp = parseDate(expiresAt);
  if (timestamp == null) return null;
  const diff = timestamp - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

export function isExpiringSoon(expiresAt: string | null, now: number = Date.now()): boolean {
  const days = daysUntilExpiry(expiresAt, now);
  return days != null && days <= LISTING_EXPIRING_SOON_DAYS;
}

// Текст бейджа: в последние сутки — в часах, дальше — в днях. null, если дата
// не задана (бессрочное объявление бейджа не получает).
export function expiryLabel(expiresAt: string | null, now: number = Date.now()): string | null {
  const timestamp = parseDate(expiresAt);
  if (timestamp == null) return null;
  const diff = timestamp - now;
  if (diff <= 0) return "Истекает";
  if (diff <= DAY_MS) return `Истекает через ${Math.ceil(diff / HOUR_MS)} ч`;
  return `Истекает через ${Math.ceil(diff / DAY_MS)} дн`;
}

// «≈ 12 км» от адреса компании до отображаемого центра круга (не реальной
// точки партии — приватность сохранена).
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return "менее 1 км";
  return `≈ ${Math.round(km)} км`;
}

export function isFreshListing(publishedAt: string | null, now: number = Date.now()): boolean {
  const timestamp = parseDate(publishedAt);
  if (timestamp == null) return false;
  const age = now - timestamp;
  return age >= 0 && age < LISTING_FRESH_HOURS * HOUR_MS;
}

// Месяцы в родительном падеже: toLocaleDateString без дня даёт именительный
// («июнь 2025»), а для «На площадке с июня 2025» нужен родительный.
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

export function memberSinceLabel(memberSince: string | null): string | null {
  const timestamp = parseDate(memberSince);
  if (timestamp == null) return null;
  const date = new Date(timestamp);
  return `с ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

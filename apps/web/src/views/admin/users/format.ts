import type { AdminUserSession } from "./types";

export function formatSessionDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export function formatSessionsCount(count: number) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) return `${count} вход`;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${count} входа`;
  return `${count} входов`;
}

export function formatLatestSession(session: AdminUserSession) {
  const device = session.userAgent ?? "Без UA";
  return `${device} · ${formatSessionDateTime(session.createdAt)}`;
}

// Форматирование чисел калькулятора рейса в ru-RU. Деньги округляем до рубля
// (ориентир для решения «ехать/не ехать», копейки шумят).

export function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

// Со знаком — для крупного вердикта прибыли (плюс/минус явно).
export function signedRub(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${rub(Math.abs(value))}`;
}

export function km(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} км`;
}

export function kg(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} кг`;
}

// Часы с одним знаком после запятой («2.1 ч»).
export function hours(value: number): string {
  return `${value.toFixed(1)} ч`;
}

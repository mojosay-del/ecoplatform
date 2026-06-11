export const EMPTY_RATING_TITLE = "Новый участник";
export const EMPTY_RATING_DESCRIPTION = "Пока нет отзывов после сделок";
export const EMPTY_RATING_ARIA_LABEL = `${EMPTY_RATING_TITLE}. ${EMPTY_RATING_DESCRIPTION}`;

export function formatRatingValue(value: number): string {
  return value.toFixed(1);
}

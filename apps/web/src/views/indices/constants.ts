import type { IndexPeriod } from "./types";

export const INDEX_PERIOD_LABELS: Record<IndexPeriod, string> = {
  "2W": "2 нед.",
  "1M": "1 мес.",
  "3M": "3 мес.",
  "6M": "6 мес.",
  "1Y": "1 год",
  "2Y": "2 года",
  "3Y": "3 года",
};

export const INDEX_PERIOD_SHORT_LABELS: Record<IndexPeriod, string> = {
  "2W": "2н",
  "1M": "1м",
  "3M": "3м",
  "6M": "6м",
  "1Y": "1г",
  "2Y": "2г",
  "3Y": "3г",
};

export const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

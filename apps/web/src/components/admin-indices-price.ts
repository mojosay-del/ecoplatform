const INTEGER_PRICE_INPUT_PATTERN = /^[0-9\s]*$/;

export function normalizeIntegerPriceInput(value: string) {
  if (!INTEGER_PRICE_INPUT_PATTERN.test(value)) return null;

  const digits = value.replace(/\s/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function parseIntegerPriceInput(value: string) {
  const digits = value.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return null;

  const price = Number(digits);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}

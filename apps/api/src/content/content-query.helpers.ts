export function parseStringArrayQuery(...values: Array<string | string[] | undefined>): string[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : value !== undefined ? [value] : []));
}

export function isPreviewQuery(value?: string) {
  return value === "1" || value === "true";
}

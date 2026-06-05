export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

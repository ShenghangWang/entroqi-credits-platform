// Provider JSON fields must never be coerced to "[object Object]".
export function paymentField(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value == null ? "" : JSON.stringify(value) ?? "";
}

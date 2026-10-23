import { createHash } from "node:crypto";

type Serializable = null | boolean | number | string | Serializable[] | { [key: string]: Serializable };

function normalize(value: unknown): Serializable {
  if (value === null) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (typeof value === "object") {
    const normalized: Record<string, Serializable> = {};

    for (const [key, child] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      if (key !== "idempotencyKey" && child !== undefined) {
        normalized[key] = normalize(child);
      }
    }

    return normalized;
  }

  throw new Error("Request body contains a non-serializable value");
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

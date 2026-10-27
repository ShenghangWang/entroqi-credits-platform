import { createHash } from "node:crypto";

type Serializable = null | boolean | number | string | Serializable[] | { [key: string]: Serializable };

function normalize(value: unknown, root = true): Serializable {
  if (value === null) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, false));
  }

  if (typeof value === "object") {
    // Preserve own JSON keys such as __proto__ instead of invoking a setter.
    const normalized: Record<string, Serializable> = Object.create(null) as Record<string, Serializable>;

    for (const [key, child] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      if (!(root && key === "idempotencyKey") && child !== undefined) {
        normalized[key] = normalize(child, false);
      }
    }

    return normalized;
  }

  throw new Error("Request body contains a non-serializable value");
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

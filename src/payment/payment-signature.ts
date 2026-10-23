import { createHmac, timingSafeEqual } from "node:crypto";

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
      if (child !== undefined) {
        normalized[key] = normalize(child);
      }
    }

    return normalized;
  }

  throw new Error("Callback payload contains a non-serializable value");
}

export function paymentSignature(payload: unknown, secret: string): string {
  return createHmac("sha256", secret).update(JSON.stringify(normalize(payload))).digest("hex");
}

export function verifyPaymentSignature(input: {
  payload: unknown;
  signature: string;
  secret: string;
}): boolean {
  const expected = paymentSignature(input.payload, input.secret);
  const actualBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

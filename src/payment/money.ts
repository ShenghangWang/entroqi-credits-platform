import { BadRequestError } from "../domain/errors.js";

/** Exact nonnegative CNY minor units; never round provider evidence. */
export function moneyMinorUnits(value: string): bigint {
  const match = /^(\d{1,16})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new BadRequestError("Invalid payment amount");
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}
export function providerAmountCents(value: string): number {
  const cents = moneyMinorUnits(value);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestError("Payment amount exceeds provider precision");
  return Number(cents);
}

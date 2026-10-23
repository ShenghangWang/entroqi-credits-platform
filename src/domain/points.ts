const SCALE = 10_000n;
const FRACTION_DIGITS = 4;

export type PointAmount = string | number | bigint;

export function toScaledPoints(value: PointAmount): bigint {
  if (typeof value === "bigint") return value * SCALE;

  const raw = String(value).trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d{0,4}))?$/);

  if (!match) {
    throw new Error(`Invalid point amount: ${raw}`);
  }

  const [, sign = "", whole = "0", fraction = ""] = match;
  const wholeScaled = BigInt(whole) * SCALE;
  const fractionScaled = BigInt(fraction.padEnd(FRACTION_DIGITS, "0"));
  const scaled = wholeScaled + fractionScaled;

  return sign === "-" ? -scaled : scaled;
}

export function fromScaledPoints(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / SCALE;
  const fraction = absolute % SCALE;

  return `${sign}${whole.toString()}.${fraction.toString().padStart(FRACTION_DIGITS, "0")}`;
}

export function addPoints(left: PointAmount, right: PointAmount): string {
  return fromScaledPoints(toScaledPoints(left) + toScaledPoints(right));
}

export function subtractPoints(left: PointAmount, right: PointAmount): string {
  return fromScaledPoints(toScaledPoints(left) - toScaledPoints(right));
}

export function negatePoints(value: PointAmount): string {
  return fromScaledPoints(-toScaledPoints(value));
}

export function absolutePoints(value: PointAmount): string {
  const scaled = toScaledPoints(value);
  return fromScaledPoints(scaled < 0n ? -scaled : scaled);
}

export function multiplyPointsByRate(points: PointAmount, rate: PointAmount): string {
  const product = toScaledPoints(points) * toScaledPoints(rate);
  const rounded = product >= 0n ? (product + SCALE / 2n) / SCALE : (product - SCALE / 2n) / SCALE;
  return fromScaledPoints(rounded);
}

export function comparePoints(left: PointAmount, right: PointAmount): number {
  const a = toScaledPoints(left);
  const b = toScaledPoints(right);

  if (a === b) return 0;
  return a > b ? 1 : -1;
}

import { BadRequestError } from "../domain/errors.js";
import { moneyMinorUnits } from "../payment/money.js";

const BPS = 10_000n;
const MAX_MONEY = 999_999_999_999_999_999n;
const ceil = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;
const money = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

/** Trusted versioned cost evidence, never a customer-supplied price or role. */
export interface OfferCost {
  version: string;
  validUntil: number;
  currency: "CNY";
  supplier: string;
  infrastructure: string;
  labor: string;
  risk: string;
  fixedFees: string;
  revenueReserveBps: number;
  targetMarginBps?: number;
}

/** A cost-review result, not an order, entitlement, or authorization to dispatch. */
export function reviewOfferPrice(cost: OfferCost, retailPrice?: string, now = Date.now()) {
  const margin = cost.targetMarginBps ?? 6000;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(cost.version) || cost.currency !== "CNY" ||
      !Number.isSafeInteger(cost.validUntil) || cost.validUntil <= now || !Number.isSafeInteger(now) ||
      !Number.isInteger(margin) || margin < 5000 || margin > 8500 ||
      !Number.isInteger(cost.revenueReserveBps) || cost.revenueReserveBps < 0 || cost.revenueReserveBps > 2000 ||
      margin + cost.revenueReserveBps > 9500) throw new BadRequestError("Invalid, expired, or unsupported cost policy");
  const costs = [cost.supplier, cost.infrastructure, cost.labor, cost.risk, cost.fixedFees].map(moneyMinorUnits);
  if (costs[2]! <= 0n) throw new BadRequestError("Paid offers require an explicit positive labor allocation");
  const total = costs.reduce((sum, value) => sum + value, 0n);
  if (total > MAX_MONEY) throw new BadRequestError("Cost exceeds supported money range");
  const feeBps = BigInt(cost.revenueReserveBps), marginBps = BigInt(margin);
  const contribution = (price: bigint) => price - ceil(price * feeBps, BPS) - total;
  const meetsMargin = (price: bigint) => contribution(price) >= ceil(price * marginBps, BPS);
  let minimum = ceil(total * BPS, BPS - feeBps - marginBps);
  // The exact check covers cent rounding; the denominator is at least 500 bps,
  // so rounding correction is bounded. No floating point or hidden markup.
  for (let n = 0; !meetsMargin(minimum) && n < 100; n++) minimum++;
  if (!meetsMargin(minimum) || minimum > MAX_MONEY) throw new BadRequestError("Price floor exceeds supported range");
  const price = retailPrice === undefined ? minimum : moneyMinorUnits(retailPrice);
  if (price < minimum || !meetsMargin(price)) throw new BadRequestError("Retail price is below the approved contribution floor");
  return {
    policyVersion: "entroqi-margin-v1", costVersion: cost.version, validUntil: cost.validUntil, currency: cost.currency,
    minimumPrice: money(minimum), retailPrice: money(price), cost: money(total),
    revenueReserve: money(ceil(price * feeBps, BPS)), contribution: money(contribution(price)), targetMarginBps: margin
  };
}

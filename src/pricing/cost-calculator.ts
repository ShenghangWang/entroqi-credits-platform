import { Decimal } from "decimal.js";
import { BadRequestError } from "../domain/errors.js";
import { moneyMinorUnits } from "../payment/money.js";
import { reviewOfferPrice, type OfferCost } from "./price-floor.js";

// Independent precision context: never change another consumer's Decimal settings.
const D = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_EVEN });
const decimal = (value: unknown, name: string, positive = false): Decimal => {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})(\.\d{1,12})?$/.test(value)) throw new BadRequestError(`${name}: use a nonnegative decimal string (up to 12 decimal places)`);
  const result = new D(value);
  if (positive && result.lte(0)) throw new BadRequestError(`${name} must be positive`);
  return result;
};
const integer = (value: unknown, name: string, positive = false): Decimal => {
  const result = decimal(value, name, positive);
  if (!result.isInteger()) throw new BadRequestError(`${name} must be an integer`);
  return result;
};
function object(value: unknown, fields: string[], required = fields): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestError("Invalid cost scenario object");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !fields.includes(key)) || required.some(key => row[key] === undefined)) throw new BadRequestError("Missing or unexpected cost scenario field");
  return row;
}
const bps = (value: unknown, name: string, max: number): number => {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > max) throw new BadRequestError(`${name} is outside its basis-point range`);
  return Number(value);
};
const detail = (value: Decimal) => value.toDecimalPlaces(12).toFixed();
const centsUp = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_CEIL).toFixed(2);
const money = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
function conversion(row: Record<string, unknown>): Decimal {
  if (!["CNY", "USD"].includes(String(row.currency))) throw new BadRequestError("Select CNY or USD; an explicit CNY conversion is required");
  const fx = decimal(row.fxToCny, "FX rate", true);
  if (row.currency === "CNY" && !fx.eq(1) || fx.gt(1000)) throw new BadRequestError("Invalid reporting-currency conversion");
  return fx;
}
export interface AiCostInput {
  currency: "CNY" | "USD"; fxToCny: string;
  inputTokens: string; cachedInputTokens: string; cacheWriteTokens: string; outputTokens: string;
  inputPerMillion: string; cachedPerMillion: string; cacheWritePerMillion: string; outputPerMillion: string;
  requests: string; requestFee: string;
}
export interface ExpenseLine {
  label: string; category: "supplier" | "infrastructure" | "risk";
  quantity: string; unitSize: string; unitRate: string; currency: "CNY" | "USD"; fxToCny: string;
}
export interface CostScenario {
  retailPrice: string; salesVolume: string; monthlyFixedCost: string;
  supportMinutes: string; supportHourlyCost: string; paymentFixedFee: string;
  paymentFeeBps: number; taxReserveBps: number; refundReserveBps: number; targetMarginBps: number;
  expenses: ExpenseLine[]; ai?: AiCostInput;
}

/** A per-sale/service-unit forecast, never actual earnings or payment authority. */
export function calculateCostScenario(input: unknown) {
  const row = object(input, ["retailPrice", "salesVolume", "monthlyFixedCost", "supportMinutes", "supportHourlyCost", "paymentFixedFee", "paymentFeeBps", "taxReserveBps", "refundReserveBps", "targetMarginBps", "expenses", "ai"],
    ["retailPrice", "salesVolume", "monthlyFixedCost", "supportMinutes", "supportHourlyCost", "paymentFixedFee", "paymentFeeBps", "taxReserveBps", "refundReserveBps", "targetMarginBps", "expenses"]);
  const price = new D(moneyMinorUnits(row.retailPrice as string).toString()).div(100);
  const volume = integer(row.salesVolume, "Monthly sales volume"), fixed = decimal(row.monthlyFixedCost, "Monthly fixed expenses");
  const labor = decimal(row.supportMinutes, "Support minutes").mul(decimal(row.supportHourlyCost, "Loaded hourly support cost")).div(60);
  const fixedFee = decimal(row.paymentFixedFee, "Fixed payment fee");
  const reserves = [bps(row.paymentFeeBps, "Payment fee", 9500), bps(row.taxReserveBps, "Tax reserve", 9500), bps(row.refundReserveBps, "Refund/risk reserve", 9500)];
  const reserveBps = reserves.reduce((a, b) => a + b, 0), target = bps(row.targetMarginBps, "Target margin", 9500);
  if (reserveBps >= 10000) throw new BadRequestError("Revenue reserves must total less than 100%");
  let supplier = new D(0), infrastructure = new D(0), risk = new D(0), aiCost = new D(0);
  const expenseResults: { label: string; category: string; costCny: string }[] = [];
  if (!Array.isArray(row.expenses) || row.expenses.length > 12) throw new BadRequestError("Use at most 12 expense lines");
  for (const inputLine of row.expenses) {
    const line = object(inputLine, ["label", "category", "quantity", "unitSize", "unitRate", "currency", "fxToCny"]);
    if (typeof line.label !== "string" || !line.label.trim() || line.label.length > 80 || !["supplier", "infrastructure", "risk"].includes(String(line.category))) throw new BadRequestError("Invalid expense label/category");
    const cost = decimal(line.quantity, "Expense quantity").div(decimal(line.unitSize, "Rate unit size", true)).mul(decimal(line.unitRate, "Unit rate")).mul(conversion(line));
    if (line.category === "supplier") supplier = supplier.add(cost);
    if (line.category === "infrastructure") infrastructure = infrastructure.add(cost);
    if (line.category === "risk") risk = risk.add(cost);
    expenseResults.push({ label: line.label, category: String(line.category), costCny: detail(cost) });
  }
  let aiBreakdown: Record<string, string> | null = null;
  if (row.ai !== undefined) {
    const ai = object(row.ai, ["currency", "fxToCny", "inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens", "inputPerMillion", "cachedPerMillion", "cacheWritePerMillion", "outputPerMillion", "requests", "requestFee"]);
    const total = integer(ai.inputTokens, "Total input tokens"), cached = integer(ai.cachedInputTokens, "Cached input tokens"), write = integer(ai.cacheWriteTokens, "Cache-write input tokens");
    if (cached.add(write).gt(total)) throw new BadRequestError("Cached and cache-write tokens are disjoint subsets of total input tokens");
    const fx = conversion(ai), uncached = total.sub(cached).sub(write);
    const tokenCost = (count: Decimal, rate: unknown) => count.mul(decimal(rate, "Rate per million tokens")).div(1_000_000).mul(fx);
    const parts = { uncachedInput: tokenCost(uncached, ai.inputPerMillion), cachedInput: tokenCost(cached, ai.cachedPerMillion),
      cacheWrites: tokenCost(write, ai.cacheWritePerMillion), output: tokenCost(integer(ai.outputTokens, "Output tokens"), ai.outputPerMillion),
      requests: integer(ai.requests, "Request count").mul(decimal(ai.requestFee, "Request fee")).mul(fx) };
    aiCost = Object.values(parts).reduce((a, b) => a.add(b), new D(0)); supplier = supplier.add(aiCost);
    aiBreakdown = Object.fromEntries(Object.entries(parts).map(([key, cost]) => [key, detail(cost)]));
  }
  const direct = supplier.add(infrastructure).add(risk).add(labor).add(fixedFee);
  if (direct.gt("9999999999999999")) throw new BadRequestError("Cost exceeds supported range");
  // One combined reserve rounded upward to a cent, matching the existing floor.
  const reserve = price.mul(reserveBps).div(10000).toDecimalPlaces(2, Decimal.ROUND_CEIL);
  const contribution = price.sub(reserve).sub(direct), revenue = price.mul(volume), monthlyContribution = contribution.mul(volume);
  const operating = monthlyContribution.sub(fixed);
  const marginPercent = price.gt(0) ? detail(contribution.div(price).mul(100)) : null;
  const markupPercent = direct.gt(0) ? detail(contribution.div(direct).mul(100)) : null;
  return { currency: "CNY" as const, basis: "estimated_per_sale_unit" as const,
    retailPrice: money(price), aiCost: detail(aiCost), aiBreakdown, expenseResults,
    supplier: detail(supplier), infrastructure: detail(infrastructure), labor: detail(labor), risk: detail(risk), fixedFees: detail(fixedFee),
    directCost: detail(direct), costRoundedUp: centsUp(direct), revenueReserve: money(reserve), revenueReserveBps: reserveBps,
    contribution: detail(contribution), contributionRounded: money(contribution), contributionMarginPercent: marginPercent,
    contributionMarkupPercent: markupPercent, lossMaking: contribution.lt(0), targetMarginBps: target,
    meetsTarget: price.gt(0) && contribution.mul(10000).gte(price.mul(target)),
    monthlyRevenue: money(revenue), monthlyContribution: money(monthlyContribution), monthlyFixedCost: money(fixed),
    estimatedMonthlyOperatingProfit: money(operating), allocatedFixedCostPerSale: volume.gt(0) ? detail(fixed.div(volume)) : null,
    breakEvenSales: contribution.gt(0) ? fixed.div(contribution).ceil().toFixed(0) : null,
    reserves: { payment: detail(price.mul(reserves[0]!).div(10000)), tax: detail(price.mul(reserves[1]!).div(10000)), refund: detail(price.mul(reserves[2]!).div(10000)) }
  };
}

export function reviewCostScenario(input: CostScenario, costVersion: string, validUntil: number, now = Date.now()) {
  const calculation = calculateCostScenario(input);
  const cost: OfferCost = { version: costVersion, validUntil, currency: "CNY", supplier: centsUp(new D(calculation.supplier)),
    infrastructure: centsUp(new D(calculation.infrastructure)), labor: centsUp(new D(calculation.labor)), risk: centsUp(new D(calculation.risk)),
    fixedFees: centsUp(new D(calculation.fixedFees)), revenueReserveBps: calculation.revenueReserveBps, targetMarginBps: input.targetMarginBps };
  try { return { calculation, cost, eligibleForSale: true as const, review: reviewOfferPrice(cost, input.retailPrice, now), reviewRequired: null }; }
  catch (error) {
    if (!(error instanceof BadRequestError)) throw error;
    return { calculation, cost, eligibleForSale: false as const, review: null, reviewRequired: error.message };
  }
}

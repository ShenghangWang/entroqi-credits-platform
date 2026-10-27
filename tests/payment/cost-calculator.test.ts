import { scenario } from "../pricing-fixtures.js";
import { describe, it, expect } from "vitest";
import { calculateCostScenario, reviewCostScenario } from "../../src/pricing/cost-calculator.js";

describe("operator forecast calculator", () => {
  it("separates contribution, operating profit, markup and break-even", () => {
    expect(calculateCostScenario(scenario())).toMatchObject({ labor: "6", revenueReserve: "0.79", contribution: "72.21", contributionRounded: "72.21", monthlyRevenue: "7900.00", estimatedMonthlyOperatingProfit: "5221.00", breakEvenSales: "28", allocatedFixedCostPerSale: "20", lossMaking: false });
  });
  it("uses disjoint token categories and explicit FX without charging cached input twice", () => {
    const ai = { currency: "USD" as const, fxToCny: "7", inputTokens: "1000000", cachedInputTokens: "200000", cacheWriteTokens: "100000", outputTokens: "500000", inputPerMillion: "2", cachedPerMillion: "0.5", cacheWritePerMillion: "3", outputPerMillion: "8", requests: "2", requestFee: "0.01" };
    expect(calculateCostScenario(scenario({ ai }))).toMatchObject({ aiCost: "40.74", aiBreakdown: { uncachedInput: "9.8", cachedInput: "0.7", cacheWrites: "2.1", output: "28", requests: "0.14" } });
    expect(() => calculateCostScenario(scenario({ ai: { ...ai, cachedInputTokens: "1000000" } }))).toThrow(/subsets/);
  });
  it("retains fractional supplier cost, per-unit expenses and negative scenarios", () => {
    const expenses = [{ label: "storage", category: "infrastructure" as const, quantity: "100", unitSize: "1000", unitRate: "0.000001", currency: "CNY" as const, fxToCny: "1" }];
    expect(calculateCostScenario(scenario({ expenses }))).toMatchObject({ infrastructure: "0.0000001" });
    const loss = calculateCostScenario(scenario({ retailPrice: "1.00" }));
    expect(loss.lossMaking).toBe(true); expect(loss.breakEvenSales).toBeNull(); expect(loss.estimatedMonthlyOperatingProfit).toBe("-2501.00");
    expect(calculateCostScenario(scenario({ retailPrice: "0.00", salesVolume: "0" }))).toMatchObject({ contributionMarginPercent: null, allocatedFixedCostPerSale: null });
  });
  it("does not hide failed publication policy or confuse an estimate with paid authority", () => {
    const now = 1000;
    expect(reviewCostScenario(scenario(), "cost-v1", 2000, now).eligibleForSale).toBe(true);
    expect(reviewCostScenario(scenario({ retailPrice: "1.00" }), "cost-v1", 2000, now).eligibleForSale).toBe(false);
    expect(reviewCostScenario(scenario(), "cost-v1", now, now).eligibleForSale).toBe(false);
    expect(calculateCostScenario(scenario())).not.toHaveProperty("orderId");
  });
  it.each([{ retailPrice: "0.001" }, { supportMinutes: "NaN" }, { salesVolume: "1.5" }, { paymentFeeBps: -1 }, { paymentFeeBps: 9500, taxReserveBps: 500 }, { targetMarginBps: 10000 }, { expenses: [{ label: "x" }] }, { unexpected: true }])("rejects malformed or ambiguous data %j", bad => {
    expect(() => calculateCostScenario({ ...scenario(), ...bad })).toThrow();
  });
});

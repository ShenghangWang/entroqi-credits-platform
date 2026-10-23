import { describe, expect, it } from "vitest";
import { reviewOfferPrice, type OfferCost } from "../../src/pricing/price-floor.js";
const now = 1_000_000;
const cost = (extra: Partial<OfferCost> = {}): OfferCost => ({ version: "storage:illustrative-v1", validUntil: now + 1000, currency: "CNY", supplier: "0.57", infrastructure: "0.00", labor: "0.50", risk: "0.00", fixedFees: "0.00", revenueReserveBps: 100, ...extra });
describe("paid-offer cost floor", () => {
  it("includes labor and exact revenue-reserve rounding in a 60% contribution floor", () => {
    expect(reviewOfferPrice(cost(), "3.00", now)).toMatchObject({ minimumPrice: "2.75", cost: "1.07", revenueReserve: "0.03", contribution: "1.90", targetMarginBps: 6000 });
    expect(reviewOfferPrice(cost({ supplier: "2.18", labor: "0.75" }), "8.00", now)).toMatchObject({ minimumPrice: "7.53" });
    expect(() => reviewOfferPrice(cost(), "2.74", now)).toThrow();
  });
  it("rejects the old high-quota price when full lifecycle and labor costs cannot meet the target", () => {
    const high = cost({ supplier: "8.63", labor: "1.50" });
    expect(() => reviewOfferPrice(high, "18.00", now)).toThrow();
    expect(reviewOfferPrice(high, "28.00", now)).toMatchObject({ minimumPrice: "25.98", contribution: "17.59" });
  });
  it.each([{ validUntil: now }, { labor: "0.00" }, { supplier: "NaN" }, { targetMarginBps: 4999 }, { targetMarginBps: 9500 }, { revenueReserveBps: -1 }, { currency: "USD" }, { version: "" }, { version: undefined }, { version: null }])("fails closed for missing, stale or invalid cost evidence: %j", extra => {
    expect(() => reviewOfferPrice(cost(extra as Partial<OfferCost>), "3.00", now)).toThrow();
  });
  it("requires labor even with free inference and does not convert free access into a paid order", () => {
    const result = reviewOfferPrice(cost({ supplier: "0.00", labor: "0.01", revenueReserveBps: 0 }), undefined, now);
    expect(result.minimumPrice).toBe("0.03");
    expect(result).not.toHaveProperty("orderId");
  });
  it("keeps cents exact beyond floating-point precision", () => {
    expect(reviewOfferPrice(cost({ supplier: "90071992547409.93", labor: "0.01", revenueReserveBps: 0 }), undefined, now).minimumPrice).toBe("225179981368524.85");
  });
});

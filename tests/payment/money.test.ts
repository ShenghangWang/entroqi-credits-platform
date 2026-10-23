import { describe, it, expect } from "vitest";
import { moneyMinorUnits, providerAmountCents } from "../../src/payment/money.js";

describe("payment amount evidence", () => {
  it("preserves exact cents including values beyond floating point precision", () => {
    expect(moneyMinorUnits("19.99")).toBe(1999n);
    expect(moneyMinorUnits("9999999999999999.99")).toBe(999999999999999999n);
    expect(moneyMinorUnits("0.1")).toBe(10n);
    expect(providerAmountCents("0.29")).toBe(29);
    expect(() => providerAmountCents("9999999999999999.99")).toThrow();
  });
  it.each(["", "NaN", "Infinity", "1e2", "-1", "1.001", " 1.00", "1."])("rejects malformed provider amount %s", amount => {
    expect(() => moneyMinorUnits(amount)).toThrow();
  });
});

it.each([null, undefined, 0.29, {}, true])("rejects non-string money evidence %j", value => {
  expect(() => moneyMinorUnits(value as string)).toThrow();
});

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const seed = require("../../scripts/seed-used-car-platform.cjs") as {
  APPLICATION: { code: string };
  FUNCTIONS: Array<{ code: string; defaultPoints: string }>;
  RECHARGE_PRODUCTS: Array<{ name: string; amount: string; points: string }>;
};

describe("usedCarPlatform seed catalog", () => {
  it("registers the expected application code", () => {
    expect(seed.APPLICATION.code).toBe("used-car-platform");
  });

  it("keeps usedCarPlatform function pricing aligned with the integration contract", () => {
    const prices = new Map(seed.FUNCTIONS.map((item) => [item.code, item.defaultPoints]));

    expect(prices).toEqual(
      new Map([
        ["showroom-light", "30.0000"],
        ["outdoor-scene", "30.0000"],
        ["road-motion", "30.0000"],
        ["sky-studio", "30.0000"],
        ["paint-refresh", "30.0000"],
        ["light-consistency", "30.0000"],
        ["interior-clean", "30.0000"],
        ["interior-collage", "30.0000"],
        ["watermark-remove", "30.0000"],
        ["batch-new-exterior", "30.0000"],
        ["batch-new-interior", "30.0000"]
      ])
    );
  });

  it("provides the five usedCarPlatform recharge products shown by the recharge modal", () => {
    expect(seed.RECHARGE_PRODUCTS).toMatchObject([
      { name: "积分充值 100 元", amount: "100.00", points: "10000.0000" },
      { name: "积分充值 200 元", amount: "200.00", points: "20000.0000" },
      { name: "积分充值 500 元", amount: "500.00", points: "50000.0000" },
      { name: "积分充值 1000 元", amount: "1000.00", points: "100000.0000" },
      { name: "积分充值 2000 元", amount: "2000.00", points: "200000.0000" }
    ]);
  });
});

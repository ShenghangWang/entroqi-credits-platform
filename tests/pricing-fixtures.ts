import type { CostScenario } from "../src/pricing/cost-calculator.js";
export const scenario = (extra: Partial<CostScenario> = {}): CostScenario => ({ retailPrice: "79.00", salesVolume: "100", monthlyFixedCost: "2000", supportMinutes: "6", supportHourlyCost: "60", paymentFixedFee: "0", paymentFeeBps: 100, taxReserveBps: 0, refundReserveBps: 0, targetMarginBps: 6000, expenses: [], ...extra });

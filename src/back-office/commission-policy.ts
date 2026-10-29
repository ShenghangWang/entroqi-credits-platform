export const MVP_COMMISSION_POLICY = {
  currency: "CNY",
  creditsPerRmb: 100,
  commissionRate: 0.1,
  commissionBase: "customer_recharge_amount",
  settlementDayOfMonth: 25,
  settlementPeriod: "previous_month",
  settlementStatusFlow: ["draft", "confirmed", "paid"],
  refundHandling: "append_reversal_row",
  sourceOfTruth: {
    rechargeOrders: "Reusable Credits Platform",
    paymentOrders: "Reusable Credits Platform",
    creditTransactions: "Reusable Credits Platform",
    commissionPreview: "Company back-office control records",
    settlementWorkflow: "Company back-office control records",
  },
  notes: [
    "1 RMB = 100 credits.",
    "Default commission rate is 10%; Developer can override it per Agent.",
    "Commission is based on actual customer recharge amount, not consumed points.",
    "Refunds create reversal records and never edit original commission rows.",
    "Settlement happens monthly on the 25th for the previous month.",
  ],
} as const;

export function getCommissionPolicy() {
  return MVP_COMMISSION_POLICY;
}

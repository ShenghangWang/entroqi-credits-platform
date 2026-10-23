import type { DatabaseClient } from "../db/pool.js";

export type CreditTransactionType =
  | "estimate"
  | "freeze"
  | "settle"
  | "refund"
  | "grant"
  | "recharge"
  | "bonus"
  | "adjustment"
  | "commission_grant";

export type CreateCreditTransactionInput = {
  tenantId?: number | null;
  userId: number;
  accountId: number;
  billingTaskId?: number | null;
  paymentOrderId?: number | null;
  applicationId?: number | null;
  functionId?: number | null;
  txnType: CreditTransactionType;
  points: string;
  balanceBefore: string;
  balanceAfter: string;
  bizType?: string | null;
  bizId?: string | null;
  refTxnId?: number | null;
  remark?: string | null;
};

export type CreditTransaction = CreateCreditTransactionInput & {
  id: number;
  createdAt: Date;
};

type CreditTransactionRow = {
  id: string;
  tenant_id: string | null;
  user_id: string;
  account_id: string;
  billing_task_id: string | null;
  payment_order_id: string | null;
  application_id: string | null;
  function_id: string | null;
  txn_type: CreditTransactionType;
  points: string;
  balance_before: string;
  balance_after: string;
  biz_type: string | null;
  biz_id: string | null;
  ref_txn_id: string | null;
  remark: string | null;
  created_at: Date;
};

function optionalNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export class CreditLedgerService {
  constructor(private readonly db: DatabaseClient) {}

  async createTransaction(input: CreateCreditTransactionInput): Promise<CreditTransaction> {
    const result = await this.db.query<CreditTransactionRow>(
      `
        insert into credit_transactions (
          tenant_id, user_id, account_id, billing_task_id, payment_order_id,
          application_id, function_id, txn_type, points, balance_before,
          balance_after, biz_type, biz_id, ref_txn_id, remark
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15
        )
        returning id, tenant_id, user_id, account_id, billing_task_id, payment_order_id,
                  application_id, function_id, txn_type, points, balance_before,
                  balance_after, biz_type, biz_id, ref_txn_id, remark, created_at
      `,
      [
        input.tenantId ?? null,
        input.userId,
        input.accountId,
        input.billingTaskId ?? null,
        input.paymentOrderId ?? null,
        input.applicationId ?? null,
        input.functionId ?? null,
        input.txnType,
        input.points,
        input.balanceBefore,
        input.balanceAfter,
        input.bizType ?? null,
        input.bizId ?? null,
        input.refTxnId ?? null,
        input.remark ?? null
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Credit transaction insert did not return a row");
    }

    return {
      id: Number(row.id),
      tenantId: optionalNumber(row.tenant_id),
      userId: Number(row.user_id),
      accountId: Number(row.account_id),
      billingTaskId: optionalNumber(row.billing_task_id),
      paymentOrderId: optionalNumber(row.payment_order_id),
      applicationId: optionalNumber(row.application_id),
      functionId: optionalNumber(row.function_id),
      txnType: row.txn_type,
      points: row.points,
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      bizType: row.biz_type,
      bizId: row.biz_id,
      refTxnId: optionalNumber(row.ref_txn_id),
      remark: row.remark,
      createdAt: row.created_at
    };
  }
}

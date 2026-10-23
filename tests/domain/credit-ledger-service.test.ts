import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/db/pool.js";
import { CreditLedgerService } from "../../src/domain/index.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "INSERT",
    oid: 0,
    fields: []
  };
}

function nullableSqlId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return String(value);
  throw new Error("Expected SQL id value");
}

describe("CreditLedgerService", () => {
  it("creates immutable ledger rows with optional billing and payment references", async () => {
    const db: DatabaseClient = {
      query: <T extends QueryResultRow>(_text: string, values?: unknown[]) =>
        Promise.resolve(
          result([
            {
              id: "99",
              tenant_id: nullableSqlId(values?.[0]),
              user_id: nullableSqlId(values?.[1]),
              account_id: nullableSqlId(values?.[2]),
              billing_task_id: nullableSqlId(values?.[3]),
              payment_order_id: nullableSqlId(values?.[4]),
              application_id: nullableSqlId(values?.[5]),
              function_id: nullableSqlId(values?.[6]),
              txn_type: values?.[7],
              points: values?.[8],
              balance_before: values?.[9],
              balance_after: values?.[10],
              biz_type: values?.[11],
              biz_id: values?.[12],
              ref_txn_id: nullableSqlId(values?.[13]),
              remark: values?.[14],
              created_at: new Date("2026-05-28T00:00:00.000Z")
            }
          ] as unknown as T[])
        )
    };

    await expect(
      new CreditLedgerService(db).createTransaction({
        tenantId: null,
        userId: 7,
        accountId: 10,
        billingTaskId: 20,
        applicationId: 30,
        functionId: 40,
        txnType: "settle",
        points: "-5.0000",
        balanceBefore: "100.0000",
        balanceAfter: "95.0000",
        bizType: "image_generation",
        bizId: "task-1",
        remark: "settled"
      })
    ).resolves.toMatchObject({
      id: 99,
      tenantId: null,
      userId: 7,
      accountId: 10,
      billingTaskId: 20,
      applicationId: 30,
      functionId: 40,
      txnType: "settle",
      points: "-5.0000",
      balanceBefore: "100.0000",
      balanceAfter: "95.0000",
      bizType: "image_generation",
      bizId: "task-1",
      remark: "settled"
    });
  });
});

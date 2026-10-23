import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import { BillingService } from "../../src/billing/billing-service.js";
import type { Database, DatabaseClient } from "../../src/db/pool.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: []
  };
}

function makeDatabase(rows: QueryResultRow[][]): {
  db: Database;
  queries: string[];
} {
  const queries: string[] = [];
  const client: DatabaseClient = {
    query: <T extends QueryResultRow>(text: string) => {
      queries.push(text);
      return Promise.resolve(result((rows.shift() ?? []) as T[]));
    }
  };

  return {
    db: {
      query: (text, values) => client.query(text, values),
      withTransaction: (fn) => fn(client),
      close: () => Promise.resolve(undefined)
    },
    queries
  };
}

const taskDate = new Date("2026-05-28T00:00:00.000Z");

function taskRow(status: string, overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "50",
    tenant_id: null,
    user_id: "7",
    account_id: "10",
    application_id: "20",
    function_id: "30",
    biz_type: "image_generation",
    biz_id: "task-1",
    estimated_points: "12.0000",
    frozen_points: status === "frozen" ? "12.0000" : "0.0000",
    settled_points: status === "settled" ? "12.0000" : "0.0000",
    status,
    created_at: taskDate,
    updated_at: taskDate,
    ...overrides
  };
}

function accountRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "10",
    tenant_id: null,
    user_id: "7",
    account_scope: "personal",
    total_balance: "100.0000",
    locked_balance: "0.0000",
    available_balance: "100.0000",
    currency: "credits",
    status: "active",
    ...overrides
  };
}

function functionRow(): QueryResultRow {
  return {
    application_id: "20",
    application_code: "used_car_ai",
    function_id: "30",
    function_code: "car_bg_showroom",
    charge_mode: "estimate_required",
    default_points: "12.0000"
  };
}

function transactionRow(txnType: string): QueryResultRow {
  return {
    id: "70",
    tenant_id: null,
    user_id: "7",
    account_id: "10",
    billing_task_id: "50",
    payment_order_id: null,
    application_id: "20",
    function_id: "30",
    txn_type: txnType,
    points: "12.0000",
    balance_before: "100.0000",
    balance_after: "100.0000",
    biz_type: "image_generation",
    biz_id: "task-1",
    ref_txn_id: null,
    remark: null,
    created_at: taskDate
  };
}

describe("BillingService", () => {
  it("estimates a billing task from server-side function pricing", async () => {
    const { db, queries } = makeDatabase([
      [{ id: "1" }],
      [accountRow()],
      [functionRow()],
      [taskRow("estimated")],
      [transactionRow("estimate")],
      []
    ]);

    await expect(
      new BillingService(db).estimate({
        userId: 7,
        accountScope: "personal",
        applicationCode: "used_car_ai",
        functionCode: "car_bg_showroom",
        bizType: "image_generation",
        bizId: "task-1",
        idempotencyKey: "estimate-1",
        requestHash: "hash-1"
      })
    ).resolves.toMatchObject({
      billingTaskId: 50,
      accountId: 10,
      estimatedPoints: "12.0000",
      status: "estimated",
      idempotentReplay: false
    });
    expect(queries.some((query) => query.includes("insert into billing_tasks"))).toBe(true);
    expect(queries.some((query) => query.includes("insert into credit_transactions"))).toBe(true);
  });

  it("accepts a positive estimatedPoints override for dynamic application pricing", async () => {
    const { db } = makeDatabase([
      [{ id: "1" }],
      [accountRow()],
      [functionRow()],
      [taskRow("estimated", { estimated_points: "45.0000" })],
      [transactionRow("estimate")],
      []
    ]);

    await expect(
      new BillingService(db).estimate({
        userId: 7,
        accountScope: "personal",
        applicationCode: "used_car_ai",
        functionCode: "car_bg_showroom",
        estimatedPoints: "45",
        bizType: "image_generation",
        bizId: "task-1",
        idempotencyKey: "estimate-override-1",
        requestHash: "hash-override-1"
      })
    ).resolves.toMatchObject({
      estimatedPoints: "45.0000",
      status: "estimated"
    });
  });

  it("rejects non-positive estimatedPoints overrides", async () => {
    const { db } = makeDatabase([
      [{ id: "1" }],
      [accountRow()],
      [functionRow()]
    ]);

    await expect(
      new BillingService(db).estimate({
        userId: 7,
        accountScope: "personal",
        applicationCode: "used_car_ai",
        functionCode: "car_bg_showroom",
        estimatedPoints: "0",
        bizType: "image_generation",
        bizId: "task-1",
        idempotencyKey: "estimate-override-2",
        requestHash: "hash-override-2"
      })
    ).rejects.toThrow("estimatedPoints must be greater than 0");
  });

  it("returns an idempotent replay without creating a second task", async () => {
    const { db, queries } = makeDatabase([
      [],
      [
        {
          id: "1",
          request_hash: "hash-1",
          response_body: {
            billingTaskId: 50,
            idempotentReplay: false
          },
          status: "completed"
        }
      ]
    ]);

    await expect(
      new BillingService(db).estimate({
        userId: 7,
        accountScope: "personal",
        applicationCode: "used_car_ai",
        functionCode: "car_bg_showroom",
        bizType: "image_generation",
        bizId: "task-1",
        idempotencyKey: "estimate-1",
        requestHash: "hash-1"
      })
    ).resolves.toMatchObject({
      billingTaskId: 50,
      idempotentReplay: true
    });
    expect(queries.some((query) => query.includes("insert into billing_tasks"))).toBe(false);
  });

  it("freezes credits using a row lock, billing lock, task update, and ledger row", async () => {
    const { db, queries } = makeDatabase([
      [{ id: "2" }],
      [taskRow("estimated")],
      [accountRow()],
      [
        accountRow({
          locked_balance: "12.0000",
          available_balance: "88.0000"
        })
      ],
      [],
      [
        taskRow("frozen", {
          frozen_points: "12.0000"
        })
      ],
      [transactionRow("freeze")],
      []
    ]);

    await expect(
      new BillingService(db).freeze({
        userId: 7,
        billingTaskId: 50,
        idempotencyKey: "freeze-1",
        requestHash: "hash-2"
      })
    ).resolves.toMatchObject({
      billingTaskId: 50,
      frozenPoints: "12.0000",
      status: "frozen"
    });
    expect(queries.some((query) => query.includes("for update"))).toBe(true);
    expect(queries.some((query) => query.includes("insert into billing_locks"))).toBe(true);
    expect(queries.some((query) => query.includes("insert into credit_transactions"))).toBe(true);
  });
});

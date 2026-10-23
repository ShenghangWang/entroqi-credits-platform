import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { Database, DatabaseClient } from "../../src/db/pool.js";
import { BadRequestError } from "../../src/domain/index.js";
import { paymentSignature } from "../../src/payment/payment-signature.js";
import { PaymentService } from "../../src/payment/payment-service.js";

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

const now = new Date("2026-05-28T00:00:00.000Z");

function productRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "3",
    name: "Starter",
    amount: "19.99",
    points: "100.0000",
    bonus_points: "10.0000",
    currency: "USD",
    sort: 1,
    enabled: true,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function accountRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "10",
    tenant_id: null,
    user_id: "7",
    account_scope: "personal",
    total_balance: "50.0000",
    locked_balance: "0.0000",
    available_balance: "50.0000",
    currency: "credits",
    status: "active",
    ...overrides
  };
}

function orderRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "88",
    tenant_id: null,
    user_id: "7",
    account_id: "10",
    product_id: "3",
    order_no: "pay_abc",
    amount: "19.99",
    points: "100.0000",
    bonus_points: "10.0000",
    pay_channel: "card",
    status: "pending",
    paid_at: null,
    notify_id: null,
    idempotency_key: "order-key",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function transactionRow(type: string, points: string): QueryResultRow {
  return {
    id: "99",
    tenant_id: null,
    user_id: "7",
    account_id: "10",
    billing_task_id: null,
    payment_order_id: "88",
    application_id: null,
    function_id: null,
    txn_type: type,
    points,
    balance_before: "50.0000",
    balance_after: "150.0000",
    biz_type: "payment_order",
    biz_id: "pay_abc",
    ref_txn_id: null,
    remark: null,
    created_at: now
  };
}

describe("PaymentService", () => {
  it("creates payment orders from backend recharge product pricing", async () => {
    const { db, queries } = makeDatabase([
      [{ id: "1" }],
      [accountRow()],
      [productRow()],
      [orderRow()],
      []
    ]);

    await expect(
      new PaymentService(db, "secret").createPaymentOrder({
        userId: 7,
        accountScope: "personal",
        productId: 3,
        payChannel: "card",
        idempotencyKey: "order-key",
        requestHash: "hash-1"
      })
    ).resolves.toMatchObject({
      paymentOrderId: 88,
      amount: "19.99",
      points: "100.0000",
      bonusPoints: "10.0000",
      status: "pending"
    });
    expect(queries.some((query) => query.includes("from recharge_products"))).toBe(true);
    expect(queries.some((query) => query.includes("insert into payment_orders"))).toBe(true);
  });

  it("rejects callbacks with invalid signatures before touching the database", async () => {
    const { db, queries } = makeDatabase([]);

    await expect(
      new PaymentService(db, "secret").processCallback({
        channel: "card",
        orderNo: "pay_abc",
        notifyId: "notify-1",
        providerStatus: "paid",
        rawData: { orderNo: "pay_abc", status: "paid" },
        sign: "0".repeat(64),
        requestHash: "hash-2"
      })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(queries).toHaveLength(0);
  });

  it("marks pending orders paid and writes recharge and bonus ledger rows once", async () => {
    const rawData = { orderNo: "pay_abc", status: "paid" };
    const sign = paymentSignature(rawData, "secret");
    const { db, queries } = makeDatabase([
      [orderRow()],
      [{ id: "2" }],
      [],
      [accountRow()],
      [accountRow({ total_balance: "150.0000", available_balance: "150.0000" })],
      [orderRow({ status: "paid", paid_at: now, notify_id: "notify-1" })],
      [transactionRow("recharge", "100.0000")],
      [accountRow({ total_balance: "160.0000", available_balance: "160.0000" })],
      [transactionRow("bonus", "10.0000")],
      []
    ]);

    await expect(
      new PaymentService(db, "secret").processCallback({
        channel: "card",
        orderNo: "pay_abc",
        notifyId: "notify-1",
        providerStatus: "paid",
        rawData,
        sign,
        requestHash: "hash-3"
      })
    ).resolves.toMatchObject({
      paymentOrderId: 88,
      status: "paid",
      callbackRecorded: true,
      credited: true
    });

    expect(queries.filter((query) => query.includes("insert into credit_transactions"))).toHaveLength(2);
  });

  it("replays duplicate callbacks without duplicate credit transactions", async () => {
    const rawData = { orderNo: "pay_abc", status: "paid" };
    const sign = paymentSignature(rawData, "secret");
    const { db, queries } = makeDatabase([
      [orderRow({ status: "paid", paid_at: now, notify_id: "notify-1" })],
      [],
      [
        {
          id: "2",
          request_hash: "hash-3",
          response_body: {
            paymentOrderId: 88,
            status: "paid",
            callbackRecorded: true,
            credited: true,
            idempotentReplay: false
          },
          status: "completed"
        }
      ]
    ]);

    await expect(
      new PaymentService(db, "secret").processCallback({
        channel: "card",
        orderNo: "pay_abc",
        notifyId: "notify-1",
        providerStatus: "paid",
        rawData,
        sign,
        requestHash: "hash-3"
      })
    ).resolves.toMatchObject({
      paymentOrderId: 88,
      idempotentReplay: true
    });
    expect(queries.some((query) => query.includes("insert into credit_transactions"))).toBe(false);
  });
});

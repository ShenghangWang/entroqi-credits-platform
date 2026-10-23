import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import { AgentService } from "../../src/agent/agent-service.js";
import type { Database, DatabaseClient } from "../../src/db/pool.js";
import { BadRequestError, ConflictError, ForbiddenError } from "../../src/domain/index.js";

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

function relationRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "10",
    agent_user_id: "1001",
    referred_user_id: "2001",
    tenant_id: null,
    relation_type: "direct",
    commission_rate: "0.1000",
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function sourceTransactionRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "20",
    tenant_id: null,
    user_id: "2001",
    account_id: "30",
    billing_task_id: "40",
    application_id: "50",
    function_id: "60",
    txn_type: "settle",
    points: "-20.0000",
    biz_type: "image_generation",
    biz_id: "task-1",
    ...overrides
  };
}

function commissionRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "70",
    agent_relation_id: "10",
    agent_user_id: "1001",
    referred_user_id: "2001",
    tenant_id: null,
    source_billing_task_id: "40",
    source_transaction_id: "20",
    commission_transaction_id: null,
    application_id: "50",
    function_id: "60",
    consumed_points: "20.0000",
    commission_rate: "0.1000",
    commission_points: "2.0000",
    status: "pending",
    created_at: now,
    settled_at: null,
    cancelled_at: null,
    ...overrides
  };
}

function accountRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "80",
    tenant_id: null,
    user_id: "1001",
    account_scope: "personal",
    total_balance: "10.0000",
    locked_balance: "0.0000",
    available_balance: "10.0000",
    currency: "credits",
    status: "active",
    ...overrides
  };
}

function ledgerRow(): QueryResultRow {
  return {
    id: "90",
    tenant_id: null,
    user_id: "1001",
    account_id: "80",
    billing_task_id: "40",
    payment_order_id: null,
    application_id: "50",
    function_id: "60",
    txn_type: "commission_grant",
    points: "2.0000",
    balance_before: "10.0000",
    balance_after: "12.0000",
    biz_type: "agent_commission",
    biz_id: "70",
    ref_txn_id: "20",
    remark: "agent commission grant",
    created_at: now
  };
}

describe("AgentService", () => {
  it("creates agent relations", async () => {
    const { db, queries } = makeDatabase([[{ id: "1" }], [relationRow()]]);

    await expect(
      new AgentService(db).createRelation({
        agentUserId: 1001,
        referredUserId: 2001,
        relationType: "direct",
        commissionRate: "0.1000"
      })
    ).resolves.toMatchObject({
      id: 10,
      agentUserId: 1001,
      referredUserId: 2001,
      commissionRate: "0.1000"
    });
    expect(queries[0]).toContain("from agent_profiles");
    expect(queries[1]).toContain("insert into agent_relations");
  });

  it("rejects relation creation for unapproved agents", async () => {
    const { db } = makeDatabase([[]]);

    await expect(
      new AgentService(db).createRelation({
        agentUserId: 1001,
        referredUserId: 2001,
        relationType: "direct",
        commissionRate: "0.1000"
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("generates commission records from settle transactions", async () => {
    const { db } = makeDatabase([
      [sourceTransactionRow()],
      [],
      [relationRow()],
      [commissionRow()]
    ]);

    await expect(new AgentService(db).generateFromSourceTransaction(20)).resolves.toMatchObject({
      commissions: [
        {
          id: 70,
          agentUserId: 1001,
          referredUserId: 2001,
          consumedPoints: "20.0000",
          commissionPoints: "2.0000",
          status: "pending"
        }
      ]
    });
  });

  it("rejects non-settle source transactions", async () => {
    const { db } = makeDatabase([[sourceTransactionRow({ txn_type: "recharge", points: "20.0000" })]]);

    await expect(new AgentService(db).generateFromSourceTransaction(20)).rejects.toBeInstanceOf(
      BadRequestError
    );
  });

  it("rejects duplicate generation for the same source transaction", async () => {
    const { db } = makeDatabase([[sourceTransactionRow()], [{ id: "70" }]]);

    await expect(new AgentService(db).generateFromSourceTransaction(20)).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it("settles pending commissions with commission_grant ledger rows", async () => {
    const { db, queries } = makeDatabase([
      [commissionRow()],
      [{ id: "1" }],
      [{ id: "2" }],
      [accountRow()],
      [accountRow()],
      [accountRow({ total_balance: "12.0000", available_balance: "12.0000" })],
      [ledgerRow()],
      [commissionRow({ status: "settled", commission_transaction_id: "90", settled_at: now })],
      []
    ]);

    await expect(
      new AgentService(db).settleCommission({
        commissionId: 70,
        idempotencyKey: "commission-70",
        requestHash: "hash-1"
      })
    ).resolves.toMatchObject({
      id: 70,
      status: "settled",
      commissionTransactionId: 90
    });
    expect(queries.some((query) => query.includes("insert into credit_transactions"))).toBe(true);
  });

  it("cancels pending commissions", async () => {
    const { db } = makeDatabase([
      [commissionRow()],
      [commissionRow({ status: "cancelled", cancelled_at: now })]
    ]);

    await expect(new AgentService(db).cancelCommission(70)).resolves.toMatchObject({
      id: 70,
      status: "cancelled",
      cancelledAt: now.toISOString()
    });
  });
});

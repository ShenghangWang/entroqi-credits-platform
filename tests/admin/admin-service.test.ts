import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import { AdminService } from "../../src/admin/admin-service.js";
import type { Database, DatabaseClient } from "../../src/db/pool.js";
import { ForbiddenError } from "../../src/domain/index.js";

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

function accountRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "10",
    tenant_id: "20",
    user_id: null,
    account_scope: "tenant",
    total_balance: "100.0000",
    locked_balance: "10.0000",
    available_balance: "90.0000",
    currency: "credits",
    status: "active",
    ...overrides
  };
}

function memberRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "30",
    tenant_id: "20",
    user_id: "7",
    role: "admin",
    status: "active",
    joined_at: now,
    created_at: now,
    ...overrides
  };
}

function transactionRow(): QueryResultRow {
  return {
    id: "40",
    tenant_id: "20",
    user_id: "7",
    account_id: "10",
    billing_task_id: null,
    payment_order_id: "50",
    application_id: null,
    function_id: null,
    txn_type: "recharge",
    points: "100.0000",
    balance_before: "0.0000",
    balance_after: "100.0000",
    biz_type: "payment_order",
    biz_id: "pay_1",
    ref_txn_id: null,
    remark: null,
    created_at: now
  };
}

describe("AdminService", () => {
  it("lists current user's personal and tenant accounts", async () => {
    const { db, queries } = makeDatabase([[accountRow()]]);

    await expect(new AdminService(db).listMyAccounts(7)).resolves.toMatchObject({
      accounts: [
        {
          id: 10,
          tenantId: 20,
          accountScope: "tenant",
          availableBalance: "90.0000"
        }
      ]
    });
    expect(queries[0]).toContain("from credit_accounts");
  });

  it("requires owner/admin role before tenant account views", async () => {
    const { db } = makeDatabase([[{ role: "employee" }]]);

    await expect(
      new AdminService(db).listTenantAccounts({
        currentUserId: 7,
        tenantId: 20
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists tenant transactions for admins", async () => {
    const { db } = makeDatabase([[{ role: "owner" }], [transactionRow()]]);

    await expect(
      new AdminService(db).listTenantTransactions({
        currentUserId: 7,
        tenantId: 20,
        limit: 50
      })
    ).resolves.toMatchObject({
      transactions: [
        {
          id: 40,
          tenantId: 20,
          paymentOrderId: 50,
          txnType: "recharge"
        }
      ]
    });
  });

  it("upserts tenant members when requested by an admin", async () => {
    const { db, queries } = makeDatabase([[{ role: "admin" }], [memberRow({ user_id: "9", role: "employee" })]]);

    await expect(
      new AdminService(db).addTenantMember({
        currentUserId: 7,
        tenantId: 20,
        userId: 9,
        role: "employee",
        status: "active"
      })
    ).resolves.toMatchObject({
      tenantId: 20,
      userId: 9,
      role: "employee",
      status: "active"
    });
    expect(queries.some((query) => query.includes("on conflict (tenant_id, user_id)"))).toBe(true);
  });

  it("updates member status after checking tenant admin permissions", async () => {
    const { db } = makeDatabase([
      [memberRow({ id: "30", user_id: "9", role: "employee" })],
      [{ role: "owner" }],
      [memberRow({ id: "30", user_id: "9", role: "employee", status: "disabled" })]
    ]);

    await expect(
      new AdminService(db).updateTenantMemberStatus({
        currentUserId: 7,
        memberId: 30,
        status: "disabled"
      })
    ).resolves.toMatchObject({
      id: 30,
      status: "disabled"
    });
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/pool.js";

const env = {
  ...loadEnv(),
  nodeEnv: "test",
  logLevel: "silent"
};
const db = createDatabase(env);

afterAll(async () => {
  await db.close();
});

async function tableColumns(tableName: string): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `
      select column_name as column_name
      from information_schema.columns
      where table_schema = database()
        and table_name = $1
    `,
    [tableName]
  );

  return result.rows.map((row) => row.column_name);
}

async function enumColumnValues(tableName: string, columnName: string): Promise<string[]> {
  const result = await db.query<{ column_type: string }>(
    `
      select column_type as column_type
      from information_schema.columns
      where table_schema = database()
        and table_name = $1
        and column_name = $2
    `,
    [tableName, columnName]
  );

  const columnType = result.rows[0]?.column_type ?? "";
  return [...columnType.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe("phase 1 schema contract", () => {
  it("creates all MVP and phase-2-ready tables", async () => {
    const result = await db.query<{ table_name: string }>(`
      select table_name as table_name
      from information_schema.tables
      where table_schema = database()
        and table_type = 'BASE TABLE'
    `);

    const tables = result.rows.map((row) => row.table_name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "tenants",
        "tenant_members",
        "credit_accounts",
        "applications",
        "application_functions",
        "billing_tasks",
        "billing_locks",
        "credit_transactions",
        "recharge_products",
        "payment_orders",
        "payment_callbacks",
        "idempotency_keys",
        "tenant_settlements",
        "platform_admins",
        "agent_profiles",
        "agent_relations",
        "agent_commissions"
      ])
    );
  });

  it("preserves corrected FK columns from the written specification", async () => {
    await expect(tableColumns("billing_tasks")).resolves.toEqual(
      expect.arrayContaining(["tenant_id", "user_id", "account_id"])
    );
    await expect(tableColumns("billing_locks")).resolves.toEqual(
      expect.arrayContaining(["billing_task_id", "tenant_id", "user_id", "account_id"])
    );
    await expect(tableColumns("payment_orders")).resolves.toEqual(
      expect.arrayContaining(["tenant_id", "user_id", "account_id", "product_id"])
    );
    await expect(tableColumns("agent_commissions")).resolves.toEqual(
      expect.arrayContaining(["commission_transaction_id", "cancelled_at"])
    );
    await expect(tableColumns("agent_profiles")).resolves.toEqual(
      expect.arrayContaining(["user_id", "status", "approved_by_user_id", "approved_at"])
    );
    await expect(tableColumns("platform_admins")).resolves.toEqual(
      expect.arrayContaining(["user_id", "role", "status"])
    );
  });

  it("uses authoritative enum values", async () => {
    await expect(enumColumnValues("application_functions", "charge_mode")).resolves.toEqual([
      "fixed",
      "dynamic",
      "estimate_required"
    ]);
    await expect(enumColumnValues("credit_transactions", "txn_type")).resolves.toEqual(
      expect.arrayContaining(["commission_grant"])
    );
  });

  it("enforces personal vs tenant account ownership shape", async () => {
    const result = await db.query<{ constraint_name: string }>(`
      select constraint_name as constraint_name
      from information_schema.check_constraints
      where constraint_schema = database()
        and constraint_name = 'credit_accounts_scope_owner_ck'
    `);

    expect(result.rows).toHaveLength(1);
  });
});

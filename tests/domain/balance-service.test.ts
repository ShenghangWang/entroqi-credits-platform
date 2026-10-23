import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { Database, DatabaseClient } from "../../src/db/pool.js";
import { BalanceService, InsufficientCreditsError, type LockedAccount } from "../../src/domain/index.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: []
  };
}

function makeDatabase(): {
  db: Database;
  client: DatabaseClient;
  queries: string[];
} {
  const queries: string[] = [];
  const client: DatabaseClient = {
    query: <T extends QueryResultRow>(text: string, values?: unknown[]) => {
      queries.push(text);

      if (text.includes("for update")) {
        return Promise.resolve(result([
          {
            id: String(values?.[0]),
            tenant_id: null,
            user_id: "7",
            total_balance: "100.0000",
            locked_balance: "10.0000",
            available_balance: "90.0000"
          }
        ] as unknown as T[]));
      }

      if (text.includes("update credit_accounts")) {
        const total = String(values?.[1]);
        const locked = String(values?.[2]);
        return Promise.resolve(result([
          {
            id: String(values?.[0]),
            tenant_id: null,
            user_id: "7",
            total_balance: total,
            locked_balance: locked,
            available_balance: "0.0000"
          }
        ] as unknown as T[]));
      }

      return Promise.resolve(result([] as T[]));
    }
  };

  return {
    db: {
      query: (text, values) => client.query(text, values),
      withTransaction: async (fn) => fn(client),
      close: () => Promise.resolve(undefined)
    },
    client,
    queries
  };
}

const account: LockedAccount = {
  id: 10,
  tenantId: null,
  userId: 7,
  totalBalance: "100.0000",
  lockedBalance: "10.0000",
  availableBalance: "90.0000"
};

describe("BalanceService", () => {
  it("locks accounts with row-level locking", async () => {
    const { db, client, queries } = makeDatabase();

    await expect(new BalanceService(db).lockAccountForUpdate(10, client)).resolves.toMatchObject({
      id: 10,
      availableBalance: "90.0000"
    });
    expect(queries[0]).toContain("for update");
  });

  it("freezes available credits", async () => {
    const { db, client } = makeDatabase();

    await expect(
      new BalanceService(db).freezeCredits({
        account,
        points: "25.0000",
        client
      })
    ).resolves.toMatchObject({
      totalBalance: "100.0000",
      lockedBalance: "35.0000"
    });
  });

  it("settles frozen credits by reducing total and locked balances", async () => {
    const { db, client } = makeDatabase();

    await expect(
      new BalanceService(db).settleFrozenCredits({
        account,
        points: "5.0000",
        client
      })
    ).resolves.toMatchObject({
      totalBalance: "95.0000",
      lockedBalance: "5.0000"
    });
  });

  it("rejects freezes that exceed available balance", async () => {
    const { db, client } = makeDatabase();

    await expect(
      new BalanceService(db).freezeCredits({
        account,
        points: "91.0000",
        client
      })
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});

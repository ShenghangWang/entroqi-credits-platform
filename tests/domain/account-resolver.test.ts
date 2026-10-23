import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/db/pool.js";
import { AccountResolver, ForbiddenError, NotFoundError } from "../../src/domain/index.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: []
  };
}

function clientWithRows(rows: QueryResultRow[][]): DatabaseClient {
  return {
    query: <T extends QueryResultRow>() => Promise.resolve(result((rows.shift() ?? []) as T[]))
  };
}

describe("AccountResolver", () => {
  it("resolves active personal accounts", async () => {
    const db = clientWithRows([
      [
        {
          id: "10",
          tenant_id: null,
          user_id: "7",
          account_scope: "personal",
          total_balance: "100.0000",
          locked_balance: "5.0000",
          available_balance: "95.0000",
          currency: "credits",
          status: "active"
        }
      ]
    ]);

    await expect(new AccountResolver(db).resolvePersonalAccount(7)).resolves.toMatchObject({
      id: 10,
      userId: 7,
      tenantId: null,
      accountScope: "personal",
      availableBalance: "95.0000"
    });
  });

  it("rejects tenant account resolution when membership is not active", async () => {
    const db = clientWithRows([[]]);

    await expect(new AccountResolver(db).resolveTenantAccount(7, 99)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("requires an active tenant account after membership verification", async () => {
    const db = clientWithRows([[{ id: "1" }], []]);

    await expect(new AccountResolver(db).resolveTenantAccount(7, 99)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

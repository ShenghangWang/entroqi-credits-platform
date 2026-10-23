import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/db/pool.js";
import { ConflictError, IdempotencyService } from "../../src/domain/index.js";

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

describe("IdempotencyService", () => {
  it("creates a fresh reservation", async () => {
    const db = clientWithRows([[{ id: "42" }]]);

    await expect(
      new IdempotencyService(db).reserve({
        userId: 1,
        idempotencyKey: "key-1",
        requestHash: "hash-1",
        expiresAt: new Date("2026-05-28T00:00:00.000Z")
      })
    ).resolves.toEqual({ kind: "fresh", id: 42 });
  });

  it("returns a completed replay for the same key and request hash", async () => {
    const db = clientWithRows([
      [],
      [
        {
          id: "42",
          request_hash: "hash-1",
          response_body: { ok: true },
          status: "completed"
        }
      ]
    ]);

    await expect(
      new IdempotencyService(db).reserve({
        userId: 1,
        idempotencyKey: "key-1",
        requestHash: "hash-1",
        expiresAt: new Date("2026-05-28T00:00:00.000Z")
      })
    ).resolves.toEqual({ kind: "replay", id: 42, responseBody: { ok: true } });
  });

  it("rejects a reused key with a different request hash", async () => {
    const db = clientWithRows([
      [],
      [
        {
          id: "42",
          request_hash: "hash-1",
          response_body: null,
          status: "processing"
        }
      ]
    ]);

    await expect(
      new IdempotencyService(db).reserve({
        userId: 1,
        idempotencyKey: "key-1",
        requestHash: "hash-2",
        expiresAt: new Date("2026-05-28T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

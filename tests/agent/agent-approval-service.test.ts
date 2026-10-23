import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import { AgentApprovalService } from "../../src/agent/agent-approval-service.js";
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

function profileRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "10",
    user_id: "1001",
    status: "pending",
    applied_at: now,
    approved_by_user_id: null,
    approved_at: null,
    rejected_at: null,
    rejected_reason: null,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

describe("AgentApprovalService", () => {
  it("creates pending agent applications", async () => {
    const { db, queries } = makeDatabase([[], [profileRow()]]);

    await expect(new AgentApprovalService(db).applyForAgent(1001)).resolves.toMatchObject({
      userId: 1001,
      status: "pending"
    });
    expect(queries[0]).toContain("from agent_profiles");
    expect(queries[1]).toContain("insert into agent_profiles");
  });

  it("requires platform admins to list applications", async () => {
    const { db } = makeDatabase([[]]);

    await expect(
      new AgentApprovalService(db).listApplications({
        currentUserId: 9001,
        limit: 50
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows platform admins to approve pending applications", async () => {
    const { db, queries } = makeDatabase([
      [{ id: "1", role: "admin" }],
      [profileRow()],
      [profileRow({ status: "approved", approved_by_user_id: "9001", approved_at: now })]
    ]);

    await expect(
      new AgentApprovalService(db).approveAgent({
        currentUserId: 9001,
        userId: 1001
      })
    ).resolves.toMatchObject({
      userId: 1001,
      status: "approved",
      approvedByUserId: 9001
    });
    expect(queries.some((query) => query.includes("from platform_admins"))).toBe(true);
    expect(queries.some((query) => query.includes("update agent_profiles"))).toBe(true);
  });

  it("rejects pending applications with an audit reason", async () => {
    const { db } = makeDatabase([
      [{ id: "1", role: "admin" }],
      [profileRow()],
      [profileRow({ status: "rejected", rejected_at: now, rejected_reason: "missing contract" })]
    ]);

    await expect(
      new AgentApprovalService(db).rejectAgent({
        currentUserId: 9001,
        userId: 1001,
        reason: "missing contract"
      })
    ).resolves.toMatchObject({
      status: "rejected",
      rejectedReason: "missing contract"
    });
  });

  it("suspends approved agents", async () => {
    const { db } = makeDatabase([
      [{ id: "1", role: "admin" }],
      [profileRow({ status: "approved", approved_by_user_id: "9001", approved_at: now })],
      [profileRow({ status: "suspended", approved_by_user_id: "9001", approved_at: now })]
    ]);

    await expect(
      new AgentApprovalService(db).suspendAgent({
        currentUserId: 9001,
        userId: 1001
      })
    ).resolves.toMatchObject({
      userId: 1001,
      status: "suspended"
    });
  });
});

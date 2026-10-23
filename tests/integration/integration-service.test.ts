import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { Database, DatabaseClient } from "../../src/db/pool.js";
import { NotFoundError } from "../../src/domain/index.js";
import { IntegrationService } from "../../src/integration/integration-service.js";

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

function applicationRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "20",
    code: "used_car_ai",
    name: "Used Car AI",
    description: "Used car image generation",
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function functionRow(overrides: QueryResultRow = {}): QueryResultRow {
  return {
    id: "30",
    application_id: "20",
    application_code: "used_car_ai",
    code: "car_bg_showroom",
    name: "Car Showroom Background",
    description: "Generate showroom background",
    charge_mode: "estimate_required",
    default_points: "12.0000",
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

describe("IntegrationService", () => {
  it("upserts external applications", async () => {
    const { db, queries } = makeDatabase([[applicationRow()]]);

    await expect(
      new IntegrationService(db).registerApplication({
        code: "used_car_ai",
        name: "Used Car AI",
        description: "Used car image generation"
      })
    ).resolves.toMatchObject({
      id: 20,
      code: "used_car_ai",
      name: "Used Car AI"
    });
    expect(queries[0]).toContain("on conflict (code) do update");
  });

  it("upserts billable functions under an application", async () => {
    const { db, queries } = makeDatabase([[applicationRow()], [functionRow()]]);

    await expect(
      new IntegrationService(db).registerFunction({
        applicationCode: "used_car_ai",
        code: "car_bg_showroom",
        name: "Car Showroom Background",
        chargeMode: "estimate_required",
        defaultPoints: "12.0000"
      })
    ).resolves.toMatchObject({
      id: 30,
      applicationId: 20,
      applicationCode: "used_car_ai",
      code: "car_bg_showroom",
      chargeMode: "estimate_required",
      defaultPoints: "12.0000"
    });
    expect(queries.some((query) => query.includes("on conflict (application_id, code)"))).toBe(true);
  });

  it("requires application registration before function registration", async () => {
    const { db } = makeDatabase([[]]);

    await expect(
      new IntegrationService(db).registerFunction({
        applicationCode: "missing",
        code: "fn",
        name: "Function",
        chargeMode: "fixed",
        defaultPoints: "1.0000"
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("exposes a pluggability contract", () => {
    expect(new IntegrationService(makeDatabase([]).db).integrationContract()).toMatchObject({
      version: "phase-5",
      registration: {
        applications: "POST /integration/applications"
      }
    });
  });
});

import type { QueryResult, QueryResultRow } from "../types/db-result.js";
import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/db/pool.js";
import { ApplicationRegistry, NotFoundError } from "../../src/domain/index.js";

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: []
  };
}

describe("ApplicationRegistry", () => {
  it("resolves active application/function pairs", async () => {
    const db: DatabaseClient = {
      query: <T extends QueryResultRow>() =>
        Promise.resolve(
        result([
          {
            application_id: "1",
            application_code: "used_car_ai",
            function_id: "2",
            function_code: "car_bg_showroom",
            charge_mode: "estimate_required",
            default_points: "20.0000"
          }
        ] as unknown as T[])
        )
    };

    await expect(
      new ApplicationRegistry(db).resolveFunction("used_car_ai", "car_bg_showroom")
    ).resolves.toEqual({
      applicationId: 1,
      applicationCode: "used_car_ai",
      functionId: 2,
      functionCode: "car_bg_showroom",
      chargeMode: "estimate_required",
      defaultPoints: "20.0000"
    });
  });

  it("raises not found for inactive or missing functions", async () => {
    const db: DatabaseClient = {
      query: <T extends QueryResultRow>() => Promise.resolve(result([] as T[]))
    };

    await expect(new ApplicationRegistry(db).resolveFunction("missing", "fn")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppEnv } from "../../src/config/env.js";
import type { Database } from "../../src/db/pool.js";

type OpenApiResponse = {
  paths: Record<string, unknown>;
};

const testEnv: AppEnv = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "silent",
  mysql: {
    host: "127.0.0.1",
    port: 3306,
    database: "credits_platform",
    user: "credits",
    password: "credits",
    connectionLimit: 10
  },
  paymentCallbackSecret: "test_secret"
};

const db: Database = {
  query: () => Promise.resolve({ rows: [] }),
  withTransaction: async (fn) => fn(db),
  close: () => Promise.resolve(undefined)
};

const app = await buildApp({ env: testEnv, db });

afterAll(async () => {
  await app.close();
});

describe("agent routes", () => {
  it("includes agent endpoints in OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/openapi.json"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<OpenApiResponse>();
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        "/agent-applications",
        "/platform/agent-applications",
        "/platform/agent-applications/{userId}/approve",
        "/platform/agent-applications/{userId}/reject",
        "/platform/agents/{userId}/suspend",
        "/agent-relations",
        "/agent-commissions",
        "/agent-commissions/generate",
        "/agent-commissions/{id}/settle",
        "/agent-commissions/{id}/cancel"
      ])
    );
  });
});

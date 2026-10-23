import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";
import type { Database } from "../src/db/pool.js";

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

describe("health routes", () => {
  it("returns service health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns database health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/db"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("serves an OpenAPI document", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/openapi.json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      info: {
        title: "Reusable Credits Platform API",
        version: "0.1.0"
      }
    });
  });
});

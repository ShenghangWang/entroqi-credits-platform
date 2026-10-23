import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppEnv } from "../../src/config/env.js";
import type { Database } from "../../src/db/pool.js";

type IntegrationContractResponse = {
  version: string;
  usageFlow: string[];
};

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

describe("integration routes", () => {
  it("serves the integration contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/integration/contract"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<IntegrationContractResponse>();
    expect(body.version).toBe("phase-5");
    expect(body.usageFlow).toContain("POST /billing/freeze");
  });

  it("includes integration endpoints in OpenAPI", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/openapi.json"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<OpenApiResponse>();
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        "/integration/contract",
        "/integration/applications",
        "/integration/applications/{applicationCode}/functions"
      ])
    );
  });
});

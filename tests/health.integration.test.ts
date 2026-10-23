import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/pool.js";

const env = {
  ...loadEnv(),
  nodeEnv: "test",
  logLevel: "silent"
};
const db = createDatabase(env);
const app = await buildApp({ env, db });

afterAll(async () => {
  await app.close();
  await db.close();
});

describe("database readiness", () => {
  it("connects to MySQL", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health/db"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});

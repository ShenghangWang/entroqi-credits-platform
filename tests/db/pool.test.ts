import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/pool.js";
import type { AppEnv } from "../../src/config/env.js";

const mocks = vi.hoisted(() => ({
  end: vi.fn(() => Promise.resolve()),
  execute: vi.fn(),
  getConnection: vi.fn()
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: vi.fn(() => ({
      execute: mocks.execute,
      getConnection: mocks.getConnection,
      end: mocks.end
    }))
  }
}));

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

describe("createDatabase", () => {
  it("closes the pool only once when close is called repeatedly", async () => {
    mocks.end.mockClear();
    const db = createDatabase(testEnv);

    await Promise.all([db.close(), db.close(), db.close()]);

    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});

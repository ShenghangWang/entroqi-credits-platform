import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import type { Database } from "../src/db/pool.js";
import { PaymentService } from "../src/payment/payment-service.js";
import { paymentCallbackEnvelope, paymentSignature } from "../src/payment/payment-signature.js";

describe("legacy billing quarantine and callback binding", () => {
  const query = vi.fn(() => Promise.reject(new Error("No database access permitted")));
  const withTransaction = vi.fn(() => Promise.reject(new Error("No financial writes permitted")));
  const db: Database = {
    query, withTransaction,
    close: async () => {}
  };
  it("refuses the legacy route builder and payment adapters outside a test environment", async () => {
    for (const nodeEnv of ["development", "production", "staging", ""]) {
      const env = { ...loadEnv(), nodeEnv };
      await expect(buildApp({ env, db })).rejects.toThrow("test-only");
      expect(() => new PaymentService(db, "secret", env)).toThrow("test-only");
    }
    try {
      vi.stubEnv("NODE_ENV", "production");
      const env = { nodeEnv: "test" } as ReturnType<typeof loadEnv>;
      await expect(buildApp({ env, db })).rejects.toThrow("test-only");
      expect(() => new PaymentService(db, "secret")).toThrow("test-only");
    } finally { vi.unstubAllEnvs(); }
    expect(query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });
  it("does not accept development database defaults or root in production", () => {
    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("MYSQL_USER", "credits");
      for (const password of [undefined, "credits", "short"]) {
        vi.stubEnv("MYSQL_PASSWORD", password);
        expect(() => loadEnv()).toThrow("dedicated non-root");
      }
      vi.stubEnv("MYSQL_PASSWORD", "isolated-fixture-password-not-a-real-secret");
      vi.stubEnv("MYSQL_USER", "root");
      expect(() => loadEnv()).toThrow("dedicated non-root");
      vi.stubEnv("MYSQL_USER", "credits");
      expect(loadEnv().mysql.user).toBe("credits");
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects replaying a signed raw body with a different order, channel, status or notification", async () => {
    const callback = { channel: "card" as const, orderNo: "pay_original", notifyId: "notice-original",
      providerStatus: "failed" as const, rawData: { reference: "original" } };
    const payment = new PaymentService(db, "secret");
    const sign = paymentSignature(paymentCallbackEnvelope(callback), "secret");
    const changes = [{ orderNo: "pay_other" }, { channel: "wechat" as const },
      { providerStatus: "paid" as const }, { notifyId: "notice-other" }, { rawData: { reference: "other" } }];
    for (const change of changes) {
      await expect(payment.processCallback({ ...callback, ...change, sign, requestHash: "test-only" }))
        .rejects.toThrow("Invalid payment callback signature");
    }
    await expect(payment.processCallback({ ...callback, sign: paymentSignature(callback.rawData, "secret"), requestHash: "test-only" }))
      .rejects.toThrow("Invalid payment callback signature");
    expect(query).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

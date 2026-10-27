import { describe, it, expect } from "vitest";
import { buildPrivateApp } from "../src/private-api.js";
import type { Database } from "../src/db/pool.js";
import { parsePricingOperators } from "../src/pricing/routes.js";
import { scenario } from "./pricing-fixtures.js";
const service = { token: "s".repeat(43), application: "simulation", issuer: "pricing-test", onboarding: "self_service" as const, permissions: ["catalog" as const] };
const operator = { id: "owner", token: "o".repeat(43), applications: ["simulation"], permissions: ["read", "write", "publish"] as ("read" | "write" | "publish")[] };
const db: Database = { query: () => Promise.reject(new Error("No database read expected")), withTransaction: () => Promise.reject(new Error("No financial write expected")), close: () => Promise.resolve() };
describe("private pricing access", () => {
  it("calculates with an operator identity, blocks application credentials and malformed roles, and serves no external scripts", async () => {
    const app = await buildPrivateApp(db, [service], [operator]);
    try {
      const call = (token: string, payload: unknown) => app.inject({ method: "POST", url: "/v1/pricing/calculate", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, payload: JSON.stringify(payload) });
      expect((await call(service.token, scenario())).statusCode).toBe(401);
      expect((await call(operator.token, scenario())).json()).toMatchObject({ contributionRounded: "72.21" });
      expect((await call(operator.token, { ...scenario(), role: "owner" })).statusCode).toBe(400);
      expect((await app.inject({ url: "/v1/pricing/products/another-app:license", headers: { authorization: "Bearer " + operator.token } })).statusCode).toBe(403);
      expect((await app.inject({ url: "/v1/catalog/another-app:license", headers: { authorization: "Bearer " + service.token } })).statusCode).toBe(403);
      const html = await app.inject({ url: "/v1/pricing" }); expect(html.statusCode).toBe(200);
      expect(html.body).toContain("定价与利润测算"); expect(html.body).not.toContain(operator.token);
      expect(html.headers["content-security-policy"]).toContain("script-src 'self'");
    } finally { await app.close(); }
  });
  it("keeps the console closed without explicit operator configuration", async () => {
    const app = await buildPrivateApp(db, [service]);
    try { expect((await app.inject({ url: "/v1/pricing" })).statusCode).toBe(404); }
    finally { await app.close(); }
  });
  it("separates pricing operators from application credentials and rejects ambiguous scopes", async () => {
    expect(() => parsePricingOperators(JSON.stringify([{ ...operator, applications: [] }]))).toThrow();
    expect(() => parsePricingOperators(JSON.stringify([operator, operator]))).toThrow();
    await expect(buildPrivateApp(db, [service], [{ ...operator, token: service.token }])).rejects.toThrow(/separate/);
  });
});

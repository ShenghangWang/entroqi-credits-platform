import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import { createDatabase } from "../src/db/pool.js";
import { loadEnv } from "../src/config/env.js";
import { PricingCatalog, type DraftPrice } from "../src/pricing/catalog.js";
import { buildPrivateApp } from "../src/private-api.js";
import { scenario } from "./pricing-fixtures.js";

it("persists immutable price/cost revisions, serializes writers and replays actions without undoing a newer price", async () => {
  const db = createDatabase(loadEnv()); let now = Date.now();
  const catalog = new PricingCatalog(db, () => now), actor = "pricing-integration", productCode = "simulation:p-" + randomUUID();
  const input: DraftPrice = { productCode, label: "Modeler v1", billingType: "one_time", unit: "v1 license", price: "79.00", expectedRevision: 0, scenario: scenario(), validUntil: now + 86400000, evidenceNote: "Independent fixture rates; no real provider call" };
  try {
    const key = randomUUID();
    const repeats = await Promise.all(Array.from({ length: 8 }, () => catalog.createDraft(actor, key, input)));
    const originalId = String(repeats[0]!.priceVersionId);
    expect(new Set(repeats.map(r => r.priceVersionId)).size).toBe(1);
    expect((await catalog.history(productCode)).versions).toHaveLength(1);
    const firstPublicationKey = randomUUID();
    await catalog.publish(actor, firstPublicationKey, productCode, originalId, null, "Initial approved reference price");
    expect(await catalog.published(productCode)).toMatchObject({ amountMinor: "7900", commerceEnabled: false, eligibleForSale: true });
    const competing = await Promise.allSettled(["99.00", "89.00"].map(price => catalog.createDraft(actor, randomUUID(), { ...input, expectedRevision: 1, price, scenario: scenario({ retailPrice: price }) })));
    expect(competing.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter(r => r.status === "rejected")).toHaveLength(1);
    const history = await catalog.history(productCode), newer = history.versions[0]!;
    await catalog.publish(actor, randomUUID(), productCode, newer.priceVersionId, originalId, "Market feedback price adjustment");
    // Retry an old successful publication after the pointer has moved. Its
    // receipt replays, but it cannot roll the current price backward.
    await catalog.publish(actor, firstPublicationKey, productCode, originalId, null, "Initial approved reference price");
    expect((await catalog.published(productCode)).priceVersionId).toBe(newer.priceVersionId);
    expect((await catalog.history(productCode)).versions.find(v => v.priceVersionId === originalId)?.price).toBe("79.00");
    await expect(catalog.createDraft(actor, key, { ...input, price: "99.00", scenario: scenario({ retailPrice: "99.00" }) })).rejects.toThrow(/different/);
    now = input.validUntil + 1;
    expect((await catalog.published(productCode)).eligibleForSale).toBe(false);
    // A successful draft retry still returns its stored identity after expiry.
    expect((await catalog.createDraft(actor, key, input)).priceVersionId).toBe(originalId);
    const restarted = new PricingCatalog(db, () => now);
    expect((await restarted.history(productCode)).versions).toHaveLength(2);
  } finally { await db.close(); }
});

it("keeps operator cost evidence private and exposes only own-application published metadata", async () => {
  const db = createDatabase(loadEnv()), productCode = "simulation:p-" + randomUUID();
  const service = { token: "c".repeat(43), application: "simulation", issuer: "pricing-api-fixture", onboarding: "self_service" as const, permissions: ["catalog" as const] };
  const operator = { id: "pricing-api-owner", token: "o".repeat(43), applications: ["simulation"], permissions: ["read", "write", "publish"] as ("read" | "write" | "publish")[] };
  const app = await buildPrivateApp(db, [service], [operator]);
  const headers = { authorization: "Bearer " + operator.token };
  const input: DraftPrice = { productCode, label: "Fixture license", billingType: "one_time", unit: "license", price: "79.00", expectedRevision: 0, scenario: scenario(), validUntil: Date.now() + 86400000, evidenceNote: "Private supplier cost evidence fixture" };
  try {
    const foreign = await app.inject({ method: "POST", url: "/v1/pricing/versions", headers, payload: { ...input, productCode: "foreign:license", idempotencyKey: randomUUID() } });
    expect(foreign.statusCode).toBe(403);
    const created = await app.inject({ method: "POST", url: "/v1/pricing/versions", headers, payload: { ...input, idempotencyKey: randomUUID() } }); expect(created.statusCode).toBe(200);
    const published = await app.inject({ method: "POST", url: "/v1/pricing/products/" + productCode + "/publish", headers, payload: { priceVersionId: created.json<{ priceVersionId: string }>().priceVersionId, expectedPublishedId: null, note: "Reviewed fixture reference publication", idempotencyKey: randomUUID() } }); expect(published.statusCode).toBe(200);
    const response = await app.inject({ url: "/v1/catalog/" + productCode, headers: { authorization: "Bearer " + service.token } });
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ productCode, amountMinor: "7900", commerceEnabled: false });
    expect(response.body).not.toContain("supplier"); expect(response.body).not.toContain("evidenceNote"); expect(response.body).not.toContain("scenario");
    expect((await app.inject({ url: "/v1/pricing/products/" + productCode, headers: { authorization: "Bearer " + service.token } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/pricing/versions", headers, payload: { ...input, idempotencyKey: randomUUID(), actor: "forged" } })).statusCode).toBe(400);
  } finally { await app.close(); await db.close(); }
});

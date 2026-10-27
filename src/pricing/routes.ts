import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Database } from "../db/pool.js";
import { DomainError } from "../domain/errors.js";
import { PricingCatalog, pricingApplication, type DraftPrice } from "./catalog.js";
import { calculateCostScenario } from "./cost-calculator.js";
import { pricingConsoleHtml, pricingConsoleScript } from "./operator-console.js";

export interface PricingOperator { id: string; token: string; applications: string[]; permissions: ("read" | "write" | "publish")[] }
export interface CatalogCredential { token: string; application: string; permissions: readonly string[] }
const digest = (value: string) => createHash("sha256").update(value).digest();
export function parsePricingOperators(raw: string): PricingOperator[] {
  let input: unknown; try { input = JSON.parse(raw); } catch { throw new Error("Invalid pricing operators JSON"); }
  if (!Array.isArray(input) || input.length > 16) throw new Error("Invalid pricing operators");
  const seen = new Set<string>(), ids = new Set<string>();
  for (const item of input as PricingOperator[]) {
    if (!item || Object.keys(item).some(key => !["id", "token", "applications", "permissions"].includes(key)) ||
        typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id) ||
        typeof item.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(item.token) || seen.has(item.token) ||
        !Array.isArray(item.applications) || !item.applications.length || item.applications.length > 32 || item.applications.some(a => typeof a !== "string" || !/^[a-z0-9-]{1,48}$/.test(a)) ||
        !Array.isArray(item.permissions) || !item.permissions.includes("read") || item.permissions.some(p => !["read", "write", "publish"].includes(p))) throw new Error("Invalid pricing operator");
    seen.add(item.token); ids.add(item.id);
  }
  return input as PricingOperator[];
}
export function registerPricingRoutes(app: FastifyInstance, db: Database, operators: PricingOperator[], credentials: CatalogCredential[]) {
  const checked = parsePricingOperators(JSON.stringify(operators));
  if (checked.some(o => credentials.some(c => c.token === o.token))) throw new Error("Pricing operator credentials must be separate from application credentials");
  const catalog = new PricingCatalog(db);
  const caller = (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return undefined;
    return checked.find(o => timingSafeEqual(digest(o.token), digest(header.slice(7))));
  };
  const guard = (permission: PricingOperator["permissions"][number]) => async (request: FastifyRequest, reply: FastifyReply) => {
    // Handler type is supplied below by Fastify; credentials, never body roles, resolve the actor.
    const who = caller(request);
    if (!who) return reply.code(401).send({ error: "unauthorized" });
    const product = (request.params as { productCode?: string })?.productCode ?? (request.body as { productCode?: string })?.productCode;
    if (product !== undefined && typeof product !== "string") return reply.code(400).send({ error: "bad_request" });
    if (!who.permissions.includes(permission) || product !== undefined && !who.applications.includes(pricingApplication(product))) return reply.code(403).send({ error: "forbidden" });
  };
  const execute = async (operation: () => unknown, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    try { return await operation(); } catch (error) {
      if (error instanceof DomainError) return reply.code(({ bad_request: 400, conflict: 409, not_found: 404, forbidden: 403 } as Record<string, number>)[error.code] ?? 400).send({ error: error.code, message: error.message });
      return reply.code(503).send({ error: "pricing_unavailable" });
    }
  };
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
  if (checked.length) {
    app.get("/v1/pricing", (_request, reply) => reply.headers(headers).type("text/html; charset=utf-8").send(pricingConsoleHtml));
    app.get("/v1/pricing/console.js", (_request, reply) => reply.headers(headers).type("application/javascript; charset=utf-8").send(pricingConsoleScript));
    app.post("/v1/pricing/calculate", { bodyLimit: 32768, preHandler: guard("read") }, (request, reply) => execute(() => calculateCostScenario(request.body), reply));
    app.get<{ Params: { productCode: string } }>("/v1/pricing/products/:productCode", { preHandler: guard("read") }, (request, reply) => execute(() => catalog.history(request.params.productCode), reply));
    app.post<{ Body: DraftPrice & { idempotencyKey: string } }>("/v1/pricing/versions", { bodyLimit: 32768, preHandler: guard("write"), schema: { body: { type: "object", additionalProperties: false,
      required: ["productCode", "label", "billingType", "unit", "price", "expectedRevision", "scenario", "validUntil", "evidenceNote", "idempotencyKey"],
      properties: { productCode: { type: "string" }, label: { type: "string" }, billingType: { enum: ["one_time", "monthly", "usage"] }, unit: { type: "string" }, price: { type: "string" }, expectedRevision: { type: "integer", minimum: 0 }, scenario: { type: "object" }, validUntil: { type: "integer" }, evidenceNote: { type: "string" }, idempotencyKey: { type: "string" } } } } }, (request, reply) => execute(() => {
      const { idempotencyKey, ...draft } = request.body; return catalog.createDraft(caller(request)!.id, idempotencyKey, draft);
    }, reply));
    app.post<{ Params: { productCode: string }; Body: { priceVersionId: string; expectedPublishedId: string | null; note: string; idempotencyKey: string } }>("/v1/pricing/products/:productCode/publish", { preHandler: guard("publish") }, (request, reply) => execute(() => {
      const body = request.body;
      if (!body || Object.keys(body).some(k => !["priceVersionId", "expectedPublishedId", "note", "idempotencyKey"].includes(k))) return reply.code(400).send({ error: "bad_request" });
      return catalog.publish(caller(request)!.id, body.idempotencyKey, request.params.productCode, body.priceVersionId, body.expectedPublishedId, body.note);
    }, reply));
  }
  app.get<{ Params: { productCode: string } }>("/v1/catalog/:productCode", { onRequest: async (request, reply) => {
    const header = request.headers.authorization;
    if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return reply.code(401).send({ error: "unauthorized" });
    const client = credentials.find(c => timingSafeEqual(digest(c.token), digest(header.slice(7))));
    if (!client) return reply.code(401).send({ error: "unauthorized" });
    if (!client.permissions.includes("catalog") || client.application !== pricingApplication(request.params.productCode)) return reply.code(403).send({ error: "forbidden" });
  } }, (request, reply) => execute(() => catalog.published(request.params.productCode), reply));
}

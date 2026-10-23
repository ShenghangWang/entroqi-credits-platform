import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import type { Database } from "./db/pool.js";

export type ServiceCredential = {
  token: string; application: string; issuer: string;
  onboarding: "self_service" | "managed";
  permissions: ("provision" | "balance")[];
};
export function parseCredentials(raw: string): ServiceCredential[] {
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || !values.length || values.length > 32) throw new Error("Configure service credentials");
  const seen = new Set<string>();
  for (const entry of values) {
    const c = entry as ServiceCredential;
    if (!c || typeof c.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(c.token) || seen.has(c.token) ||
        typeof c.application !== "string" || !/^[a-z0-9-]{1,100}$/.test(c.application) ||
        typeof c.issuer !== "string" || !/^[A-Za-z0-9:/._-]{1,100}$/.test(c.issuer) ||
        !["self_service", "managed"].includes(c.onboarding) || !Array.isArray(c.permissions) ||
        !c.permissions.length || c.permissions.some(p => !["provision", "balance"].includes(p))) throw new Error("Invalid service credential");
    seen.add(c.token);
  }
  // One authority cannot assign conflicting onboarding policies to the same namespace.
  for (const c of values as ServiceCredential[]) {
    if ((values as ServiceCredential[]).some(other => other.issuer === c.issuer && other.onboarding !== c.onboarding)) throw new Error("Conflicting issuer policy");
  }
  return values as ServiceCredential[];
}
const digest = (value: string) => createHash("sha256").update(value).digest();
export async function buildPrivateApp(db: Database, supplied: ServiceCredential[]) {
  const credentials = parseCredentials(JSON.stringify(supplied)).map(c => ({ ...c, hash: digest(c.token) }));
  const app = Fastify({ logger: false, bodyLimit: 4096, requestTimeout: 10_000, ajv: { customOptions: { removeAdditional: false } } });
  app.get("/health", () => ({ status: "ok" }));
  app.get("/health/db", async (_req, reply) => {
    try { await db.query("select 1"); return { status: "ok" }; }
    catch { return reply.code(503).send({ error: "database_unavailable" }); }
  });
  app.post<{ Body: { subject: string; action: "provision" | "balance" } }>("/v1/customer", {
    schema: { body: { type: "object", required: ["subject", "action"], additionalProperties: false,
      properties: { subject: { type: "string", minLength: 1, maxLength: 191, pattern: "^[A-Za-z0-9_-]+$" }, action: { enum: ["provision", "balance"] } } } },
    onRequest: async (request, reply) => {
      const header = request.headers.authorization;
      if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header) ||
          !credentials.some(c => timingSafeEqual(c.hash, digest(header.slice(7))))) return reply.code(401).send({ error: "unauthorized" });
    }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const caller = credentials.find(c => timingSafeEqual(c.hash, digest(request.headers.authorization!.slice(7))))!;
    const { subject, action } = request.body;
    if (!caller.permissions.includes(action)) return reply.code(403).send({ error: "forbidden" });
    // A managed caller must be an authorized product backend, after its staff authorization.
    // No browser-supplied role, application, wallet ID, balance or registration policy is accepted.
    try {
      const result = await db.withTransaction(async client => {
        if (action === "provision") {
          await client.query(`insert into customer_external_identities (issuer, subject) values ($1, $2)
            on duplicate key update issuer = issuer`, [caller.issuer, subject]);
        }
        const mapping = await client.query<{ user_id: number | null; account_id: number | null }>(
          "select user_id, account_id from customer_external_identities where issuer = $1 and subject = $2 for update", [caller.issuer, subject]);
        const row = mapping.rows[0];
        if (!row) return null;
        if (row.user_id === null && action === "provision") {
          const user = await client.query("insert into users (status) values ('active')");
          if (!user.insertId) throw new Error("Missing user ID");
          const wallet = await client.query("insert into credit_accounts (user_id, account_scope) values ($1, 'personal')", [user.insertId]);
          if (!wallet.insertId) throw new Error("Missing account ID");
          await client.query("update customer_external_identities set user_id = $1, account_id = $2 where issuer = $3 and subject = $4",
            [user.insertId, wallet.insertId, caller.issuer, subject]);
          row.user_id = user.insertId; row.account_id = wallet.insertId;
        }
        if (!row.account_id) return null;
        const wallet = await client.query<{ total_balance: string; locked_balance: string; available_balance: string; currency: string }>(
          `select a.total_balance, a.locked_balance, a.available_balance, a.currency from credit_accounts a join users u on u.id = a.user_id
            where a.id = $1 and a.user_id = $2 and a.status = 'active' and u.status = 'active'`, [row.account_id, row.user_id]);
        if (!wallet.rows[0]) return null;
        const balance = wallet.rows[0];
        return { customerId: String(row.user_id), accountId: String(row.account_id), total: balance.total_balance,
          reserved: balance.locked_balance, available: balance.available_balance, currency: balance.currency };
      });
      return result ?? reply.code(404).send({ error: "customer_unavailable" });
    } catch { return reply.code(503).send({ error: "billing_unavailable" }); }
  });
  return app;
}

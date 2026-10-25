import { closeCustomer } from "./customer/close-customer.js";
import { ConflictError } from "./domain/errors.js";
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import type { Database } from "./db/pool.js";
import { registerIdentityNamespaces, unlinkCompanyApplication } from './customer/identity-namespaces.js';

export type ServiceCredential = {
  token: string; application: string; issuer: string;
  onboarding: "self_service" | "managed";
  identityMode?: 'isolated' | 'company';
  permissions: ("provision" | "balance" | "close" | "unlink")[];
};
export function parseCredentials(raw: string): ServiceCredential[] {
  let values: unknown;
  try { values = JSON.parse(raw); }
  catch { throw new Error("Invalid service credentials JSON"); }
  if (!Array.isArray(values) || !values.length || values.length > 32) throw new Error("Configure service credentials");
  const seen = new Set<string>();
  for (const entry of values) {
    const c = entry as ServiceCredential;
    if (!c || typeof c.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(c.token) || seen.has(c.token) ||
        typeof c.application !== "string" || !/^[a-z0-9-]{1,100}$/.test(c.application) ||
        typeof c.issuer !== "string" || !/^[A-Za-z0-9:/._-]{1,100}$/.test(c.issuer) ||
        !["self_service", "managed"].includes(c.onboarding) || !Array.isArray(c.permissions) ||
        ![undefined, 'isolated', 'company'].includes(c.identityMode) ||
        !c.permissions.length || c.permissions.some(p => !["provision", "balance", "close", "unlink"].includes(p))) throw new Error("Invalid service credential");
    if (c.identityMode === 'company' && (c.onboarding !== 'self_service' ||
        c.permissions.includes('close') && c.application !== 'company-identity' ||
        c.application === 'company-identity' && c.permissions.some(p => p !== 'close'))) throw new Error('Company closure belongs to the identity authority');
    if (c.identityMode !== 'company' && (c.permissions.includes('unlink') || c.application === 'company-identity')) throw new Error('Company permission requires company identity mode');
    seen.add(c.token);
  }
  // Credential rotation may change tokens/permissions, never identity ownership.
  // The DB key is (issuer, subject): sharing an issuer between applications would
  // resolve the same customer/wallet despite different application labels.
  for (const c of values as ServiceCredential[]) {
    if ((values as ServiceCredential[]).some(other =>
      (other.issuer === c.issuer && (other.onboarding !== c.onboarding || (other.identityMode ?? 'isolated') !== (c.identityMode ?? 'isolated') ||
        other.application !== c.application && c.identityMode !== 'company')) ||
      (other.application === c.application && other.issuer !== c.issuer))) throw new Error("Conflicting application identity namespace");
  }
  return values as ServiceCredential[];
}
const digest = (value: string) => createHash("sha256").update(value).digest();
export async function buildPrivateApp(db: Database, supplied: ServiceCredential[]) {
  const credentials = parseCredentials(JSON.stringify(supplied)).map(c => ({ ...c, hash: digest(c.token) }));
  if (credentials.some(c => c.identityMode === 'company')) await registerIdentityNamespaces(db, credentials);
  const app = Fastify({ logger: false, bodyLimit: 4096, requestTimeout: 10_000, ajv: { customOptions: { removeAdditional: false } } });
  app.get("/health", () => ({ status: "ok" }));
  app.get("/health/db", async (_req, reply) => {
    try { await db.query("select 1"); return { status: "ok" }; }
    catch { return reply.code(503).send({ error: "database_unavailable" }); }
  });
  app.post<{ Body: { subject: string; action: "provision" | "balance" | "close" | "unlink" } }>("/v1/customer", {
    schema: { body: { type: "object", required: ["subject", "action"], additionalProperties: false,
      properties: { subject: { type: "string", minLength: 1, maxLength: 191, pattern: "^[A-Za-z0-9_-]+$" }, action: { enum: ["provision", "balance", "close", "unlink"] } } } },
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
      if (action === "close") { const result = await closeCustomer(db, caller.issuer, subject, caller.identityMode === 'company'); return caller.identityMode === 'company' ? { ...result, issuer: caller.issuer, application: caller.application } : result; }
      if (action === 'unlink') return await unlinkCompanyApplication(db, caller.issuer, subject, caller.application);
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
        if (caller.identityMode === 'company' && action === 'balance') {
          const membership = await client.query<{ status: string }>('select status from customer_application_memberships where application=$1 and issuer=$2 and subject=$3', [caller.application, caller.issuer, subject]);
          if (membership.rows[0]?.status !== 'active') return null;
        }
        const wallet = await client.query<{ total_balance: string; locked_balance: string; available_balance: string; currency: string }>(
          `select a.total_balance, a.locked_balance, a.available_balance, a.currency from credit_accounts a join users u on u.id = a.user_id
            where a.id = $1 and a.user_id = $2 and a.status = 'active' and u.status = 'active'`, [row.account_id, row.user_id]);
        if (!wallet.rows[0]) return null;
        if (caller.identityMode === 'company' && action === 'provision') await client.query(`insert into customer_application_memberships (application,issuer,subject,status) values ($1,$2,$3,'active')
          on duplicate key update status=if(status='closed','closed','active')`, [caller.application, caller.issuer, subject]);
        const balance = wallet.rows[0];
        return { ...(caller.identityMode === 'company' ? { issuer: caller.issuer, application: caller.application } : {}), customerId: String(row.user_id), accountId: String(row.account_id), total: balance.total_balance,
          reserved: balance.locked_balance, available: balance.available_balance, currency: balance.currency };
      });
      return result ?? reply.code(404).send({ error: "customer_unavailable" });
    } catch (error) {
      if (error instanceof ConflictError) return reply.code(409).send({ error: "closure_blocked" });
      return reply.code(503).send({ error: "billing_unavailable" });
    }
  });
  await app.ready();
  return app;
}

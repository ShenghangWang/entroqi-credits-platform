import { beforeAll, afterAll, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import mysql, { type Connection } from 'mysql2/promise';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/pool.js';
import { buildPrivateApp, type ServiceCredential } from '../src/private-api.js';
import { CompanyRegistry, companyApplications, COMPANY_ISSUER } from '../src/company/registry.js';
import { PricingCatalog } from '../src/pricing/catalog.js';
import { scenario } from './pricing-fixtures.js';

const require = createRequire(import.meta.url);
const { registerCompanyApplications } = require('../scripts/register-company-apps.cjs') as { registerCompanyApplications: (connection: Connection) => Promise<unknown> };
const env = loadEnv();
if (!/(?:^|_)tests?(?:_|$)/.test(env.mysql.database)) throw new Error('Company registry tests require an explicitly disposable test database');
const db = createDatabase(env);
let connection: Connection;
async function reset() {
  const [rows] = await connection.query<mysql.RowDataPacket[]>("select table_name from information_schema.tables where table_schema=database() and table_type='BASE TABLE' and table_name<>'schema_migrations'");
  await connection.query('set foreign_key_checks=0');
  try { for (const row of rows) { const name = String(row.TABLE_NAME ?? row.table_name); if (!/^[a-z0-9_]+$/i.test(name)) throw new Error('Unexpected table'); await connection.query('delete from `' + name + '`'); } }
  finally { await connection.query('set foreign_key_checks=1'); }
}
beforeAll(async () => { connection = await mysql.createConnection(env.mysql); await reset(); await registerCompanyApplications(connection); });
afterAll(async () => { if (connection) { await reset(); await connection.end(); } await db.close(); });
const credentials: ServiceCredential[] = companyApplications.map((item, index) => ({ application: item.application, issuer: COMPANY_ISSUER, identityMode: 'company', onboarding: 'self_service', token: String(index + 1).repeat(43), permissions: ['provision', 'balance', 'unlink', 'catalog'] }));
const owner = { id: 'company-owner', token: 'o'.repeat(43), applications: credentials.map(item => item.application) };
const aiOnly = { id: 'ai-reader', token: 'a'.repeat(43), applications: ['atlas-ai'] };
const priceOperator = { id: 'price-owner', token: 'p'.repeat(43), applications: owner.applications, permissions: ['read', 'write', 'publish'] as ('read' | 'write' | 'publish')[] };
const auth = (token: string) => ({ authorization: 'Bearer ' + token });

it('persists exactly three company products and repeated registration creates no financial data or duplicates', async () => {
  await registerCompanyApplications(connection); await registerCompanyApplications(connection);
  const registry = new CompanyRegistry(db), rows = await registry.applications(owner.applications);
  expect(rows.map(row => row.application).sort()).toEqual(['atlas-ai', 'atlas-simulation', 'simulation']);
  expect(new Set(rows.map(row => row.accessKey)).size).toBe(3);
  const counts = await db.query<{ users: number; wallets: number; prices: number }>('select (select count(*) from users) users,(select count(*) from credit_accounts) wallets,(select count(*) from pricing_products) prices');
  expect(counts.rows[0]).toEqual({ users: 0, wallets: 0, prices: 0 });
  expect(await new CompanyRegistry(db).application('atlas-ai')).toMatchObject({ productKey: 'modern_ai_atlas', accessKey: 'ai_atlas_access', commerceEnabled: false, paidAccessEnabled: false });
});
it('refuses foreign app installations and changed product mappings without deleting or relabeling records', async () => {
  await db.query("insert into applications (code,name,status) values ('foreign-fixture','Foreign fixture','active')");
  await expect(registerCompanyApplications(connection)).rejects.toThrow(/clean Entroqi database/);
  expect((await db.query('select code from applications where code=$1', ['foreign-fixture'])).rows).toHaveLength(1);
  await db.query('delete from applications where code=$1', ['foreign-fixture']);
  await db.query("update company_application_products set access_key='wrong-access' where application_code='atlas-ai'");
  try { await expect(registerCompanyApplications(connection)).rejects.toThrow(/mapping changed/); await expect(new CompanyRegistry(db).application('atlas-ai')).rejects.toThrow(/reviewed migration/); }
  finally { await db.query("update company_application_products set access_key='ai_atlas_access' where application_code='atlas-ai'"); }
});
it('all three apps share one wallet while memberships, staff data scopes and service metadata stay separate', async () => {
  const app = await buildPrivateApp(db, credentials, [priceOperator], [owner, aiOnly]), subject = randomUUID();
  const customer = (i: number, action: string) => app.inject({ method: 'POST', url: '/v1/customer', headers: auth(credentials[i]!.token), payload: { subject, action } });
  try {
    await new CompanyRegistry(db).validateCredentials(credentials);
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => customer(i % 3, 'provision')));
    expect(replies.map(reply => reply.statusCode)).toEqual(Array(12).fill(200));
    expect(new Set(replies.map(reply => reply.json<{ accountId: string }>().accountId)).size).toBe(1);
    for (let i = 0; i < credentials.length; i++) {
      const response = await app.inject({ url: '/v1/application', headers: auth(credentials[i]!.token) });
      expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ application: credentials[i]!.application, commerceEnabled: false, paidAccessEnabled: false });
      expect((await app.inject({ url: '/v1/application?application=foreign', headers: auth(credentials[i]!.token) })).statusCode).toBe(400);
      expect((await customer(i, 'close')).statusCode).toBe(403);
    }
    const overview = await app.inject({ url: '/v1/platform/data', headers: auth(owner.token) });
    expect(overview.json<{ applications: unknown[] }>().applications).toHaveLength(3);
    const scoped = await app.inject({ url: '/v1/platform/data', headers: auth(aiOnly.token) });
    expect(scoped.json<{ applications: { application: string }[] }>().applications.map(row => row.application)).toEqual(['atlas-ai']);
    const customers = await app.inject({ url: '/v1/platform/data?section=customers', headers: auth(aiOnly.token) });
    expect(customers.json<{ customers: { memberships: { application: string }[] }[] }>().customers[0]!.memberships.map(row => row.application)).toEqual(['atlas-ai']);
    expect(customers.body).not.toMatch(/password|email|phone|token/);
    expect((await customer(1, 'unlink')).statusCode).toBe(200);
    expect((await customer(1, 'balance')).statusCode).toBe(404);
    expect((await customer(0, 'balance')).statusCode).toBe(200); expect((await customer(2, 'balance')).statusCode).toBe(200);
    expect((await app.inject({ url: '/v1/platform/data?section=transactions', headers: auth(aiOnly.token) })).json()).toMatchObject({ transactions: [] });
  } finally { await app.close(); }
});
it('publishing one Atlas reference price never prices or unlocks the other Atlas', async () => {
  const app = await buildPrivateApp(db, credentials, [priceOperator], [owner]);
  const catalog = new PricingCatalog(db), productCode = 'atlas-simulation:access';
  try {
    const draft = await catalog.createDraft('fixture-owner', randomUUID(), { productCode, label: 'Fixture reference only', unit: 'fixture access', billingType: 'one_time', price: '19.00', expectedRevision: 0, scenario: scenario({ retailPrice: '19.00' }), validUntil: Date.now() + 86400000, evidenceNote: 'Synthetic integration fixture; not an owner-approved price' });
    await catalog.publish('fixture-owner', randomUUID(), productCode, String(draft.priceVersionId), null, 'Fixture reference publication');
    expect((await app.inject({ url: '/v1/catalog/' + productCode, headers: auth(credentials[1]!.token) })).json()).toMatchObject({ amountMinor: '1900', commerceEnabled: false });
    expect((await app.inject({ url: '/v1/catalog/' + productCode, headers: auth(credentials[2]!.token) })).statusCode).toBe(403);
    expect((await app.inject({ url: '/v1/catalog/atlas-ai:access', headers: auth(credentials[2]!.token) })).statusCode).toBe(404);
    const data = (await app.inject({ url: '/v1/platform/data?section=prices', headers: auth(owner.token) })).json<{ applications: { application: string; priceStatus: string; paidAccessEnabled: boolean }[] }>();
    expect(data.applications.find(row => row.application === 'atlas-ai')).toMatchObject({ priceStatus: 'unpriced', paidAccessEnabled: false });
    expect(data.applications.find(row => row.application === 'atlas-simulation')).toMatchObject({ priceStatus: 'reference_only', paidAccessEnabled: false });
  } finally { await app.close(); }
});

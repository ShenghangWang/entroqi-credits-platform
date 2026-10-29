import { it, expect } from 'vitest';
import type { Database } from '../src/db/pool.js';
import { buildPrivateApp } from '../src/private-api.js';
import { parsePlatformOperators } from '../src/company/routes.js';

const operator = { id: 'owner', token: 'p'.repeat(43), applications: ['simulation', 'atlas-simulation', 'atlas-ai'] };
const service = { token: 's'.repeat(43), application: 'simulation', issuer: 'isolated-test', onboarding: 'self_service' as const, permissions: ['catalog' as const] };
const db: Database = { query: () => Promise.reject(new Error('private database detail')), withTransaction: () => Promise.reject(new Error('offline')), close: () => Promise.resolve() };

it('requires explicit unique staff identities and registered company application scopes', () => {
  expect(parsePlatformOperators(JSON.stringify([operator]))).toEqual([operator]);
  for (const row of [{ ...operator, applications: [] }, { ...operator, applications: ['foreign-app'] }, { ...operator, applications: ['simulation', 'simulation'] }, { ...operator, role: 'owner' }, { ...operator, token: 'short' }]) expect(() => parsePlatformOperators(JSON.stringify([row]))).toThrow();
  expect(() => parsePlatformOperators(JSON.stringify([operator, operator]))).toThrow();
});
it('keeps operator data private, redirects to the full console and preserves fail-closed legacy boundaries', async () => {
  const app = await buildPrivateApp(db, [service], [], [operator]);
  try {
    expect((await app.inject({ url: '/v1/platform/data' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/platform/data', headers: { authorization: 'Bearer ' + service.token } })).statusCode).toBe(401);
    const headers = { authorization: 'Bearer ' + operator.token };
    expect((await app.inject({ url: '/v1/platform/data?application=atlas-ai', headers })).statusCode).toBe(400);
    expect((await app.inject({ url: '/v1/platform/data?cursor=9007199254740992', headers })).statusCode).toBe(400);
    const offline = await app.inject({ url: '/v1/platform/data', headers });
    expect(offline.statusCode).toBe(503); expect(offline.body).not.toContain('private database detail');
    const redirect = await app.inject({ url: '/v1/platform' });
    expect(redirect.statusCode).toBe(302); expect(redirect.headers.location).toBe('/back-office');
    const shell = await app.inject({ url: '/back-office' });
    expect(shell.body).not.toContain(operator.token);
    expect(shell.headers['content-security-policy']).toContain("script-src 'self'");
    expect((await app.inject({ url: '/v1/platform/console.js' })).statusCode).toBe(404);
    for (const url of ['/billing/freeze', '/payment-orders', '/integration/applications', '/v1/platform/data']) expect((await app.inject({ method: 'POST', url, headers, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ url: '/v1/application', headers: { authorization: 'Bearer ' + service.token } })).statusCode).toBe(403);
  } finally { await app.close(); }
});
it('does not expose a staff console without configuration or accept a product credential as staff', async () => {
  const app = await buildPrivateApp(db, [service]);
  try { expect((await app.inject({ url: '/v1/platform' })).statusCode).toBe(404); }
  finally { await app.close(); }
  await expect(buildPrivateApp(db, [service], [], [{ ...operator, token: service.token }])).rejects.toThrow(/separate/);
});

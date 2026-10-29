import { it, expect } from 'vitest';
import { buildPrivateApp } from '../src/private-api.js';
import type { Database } from '../src/db/pool.js';
import { canCreateAccountFromSnapshot, defaultAccountCreationPolicySnapshot } from '../src/back-office/account-creation-policy.js';
const service = { token: 's'.repeat(43), application: 'simulation', issuer: 'staff-fixture', onboarding: 'self_service' as const, permissions: ['catalog' as const] };
const db: Database = { query: () => Promise.reject(new Error('No financial query expected')), withTransaction: () => Promise.reject(new Error('No write expected')), close: () => Promise.resolve() };
const owner = { id: 'owner', token: 'o'.repeat(43), applications: ['simulation'] };
it('exchanges operator credentials for HttpOnly sessions and rejects role forgery, cross-origin login and stale logout sessions', async () => {
  const app = await buildPrivateApp(db, [service], [], [owner]);
  const origin = 'http://127.0.0.1:3100';
  try {
    const payload = { username: 'owner', password: owner.token, role: 'agent' };
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://untrusted.example' }, payload })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/v1/auth/me' })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload });
    expect(login.statusCode).toBe(200); expect(login.json()).toMatchObject({ data: { userInfo: { role: 'developer' } } });
    expect(login.body).not.toContain(owner.token);
    const setCookie = String(login.headers['set-cookie']); expect(setCookie).toContain('HttpOnly'); expect(setCookie).toContain('SameSite=Strict');
    const cookie = setCookie.split(';')[0]!;
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin: 'http://untrusted.example' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
  } finally { await app.close(); }
});
it('preserves original optional account-creation policy while ordinary users cannot become back-office operators', () => {
  expect(canCreateAccountFromSnapshot('developer', 'admin', defaultAccountCreationPolicySnapshot).allowed).toBe(true);
  expect(canCreateAccountFromSnapshot('enterprise', 'admin', defaultAccountCreationPolicySnapshot).allowed).toBe(false);
  expect(canCreateAccountFromSnapshot('agent', 'user', { ...defaultAccountCreationPolicySnapshot, developer_allows_agent_create_users: false }).allowed).toBe(false);
});
it('an agent credential cannot use the broad staff data API and agent login is off unless explicitly enabled', async () => {
  const agent = { id: 'optional-agent', token: 'a'.repeat(43), applications: ['simulation'], role: 'agent' as const, subject: 'verified-fixture-subject' };
  const app = await buildPrivateApp(db, [service], [], [agent]);
  try {
    expect((await app.inject({ url: '/v1/platform/data', headers: { authorization: 'Bearer ' + agent.token } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://127.0.0.1:3100' }, payload: { username: agent.id, password: agent.token } })).statusCode).toBe(401);
  } finally { await app.close(); }
});

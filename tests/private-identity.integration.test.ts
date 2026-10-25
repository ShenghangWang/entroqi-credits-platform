import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/pool.js';
import { buildPrivateApp } from '../src/private-api.js';
import { registerIdentityNamespaces } from '../src/customer/identity-namespaces.js';
it('concurrent provisioning gives one zero wallet; issuer namespaces remain separate', async () => {
  const db = createDatabase(loadEnv());
  const token = 'a'.repeat(43), second = 'b'.repeat(43);
  const app = await buildPrivateApp(db, [
    { token, application: 'simulation', issuer: 'test-simulation', onboarding: 'self_service', permissions: ['provision', 'balance'] },
    { token: second, application: 'managed-product', issuer: 'test-managed', onboarding: 'managed', permissions: ['provision', 'balance'] }
  ]);
  type Customer = { accountId: string; customerId: string };
  const subject = randomUUID();
  const call = (key = token) => app.inject({ method: 'POST', url: '/v1/customer', headers: { authorization: 'Bearer ' + key }, payload: { subject, action: 'provision' } });
  try {
    const replies = await Promise.all(Array.from({ length: 12 }, () => call()));
    expect(replies.map(r => r.statusCode)).toEqual(Array(12).fill(200));
    const bodies = replies.map(r => r.json<Customer>());
    expect(new Set(bodies.map(b => b.accountId)).size).toBe(1);
    expect(bodies[0]).toMatchObject({ total: '0.0000', reserved: '0.0000', available: '0.0000' });
    const other = await call(second);
    expect(other.statusCode).toBe(200);
    expect(other.json<Customer>().accountId).not.toBe(bodies[0]!.accountId);
    const count = await db.query<{ count: number }>('select count(*) as count from credit_accounts where user_id = $1', [bodies[0]!.customerId]);
    expect(Number(count.rows[0]?.count)).toBe(1);
  } finally { await app.close(); await db.close(); }
});

it('one company subject provisions one shared wallet concurrently across three applications; unlink and global closure are separate', async () => {
  const db = createDatabase(loadEnv()), issuer = 'company-' + randomUUID(), subject = randomUUID();
  const credentials = ['simulation', 'atlas-simulation', 'atlas-modern-ai'].map((application, i) => ({
    token: String(i + 1).repeat(43), application, issuer, identityMode: 'company' as const, onboarding: 'self_service' as const,
    permissions: ['provision', 'balance', 'unlink'] as ('provision' | 'balance' | 'unlink')[]
  }));
  const authority = { token: '4'.repeat(43), application: 'company-identity', issuer, identityMode: 'company' as const, onboarding: 'self_service' as const, permissions: ['close'] as 'close'[] };
  const app = await buildPrivateApp(db, [...credentials, authority]);
  const call = (i: number, action: string, who = subject) => app.inject({ method: 'POST', url: '/v1/customer', headers: { authorization: 'Bearer ' + [...credentials, authority][i]!.token }, payload: { subject: who, action } });
  try {
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => call(i % 3, 'provision')));
    expect(replies.map(r => r.statusCode)).toEqual(Array(12).fill(200));
    const bodies = replies.map(r => r.json<{ customerId: string; accountId: string }>());
    expect(new Set(bodies.map(r => r.customerId)).size).toBe(1); expect(new Set(bodies.map(r => r.accountId)).size).toBe(1);
    expect(replies[0]!.json()).toMatchObject({ issuer, total: '0.0000' });
    expect((await call(1, 'close')).statusCode).toBe(403);
    expect((await call(1, 'unlink')).statusCode).toBe(200); expect((await call(1, 'unlink')).statusCode).toBe(200);
    expect((await call(1, 'balance')).statusCode).toBe(404);
    expect((await call(0, 'balance')).json<{ accountId: string }>().accountId).toBe(bodies[0]!.accountId);
    expect((await call(2, 'balance')).json<{ accountId: string }>().accountId).toBe(bodies[0]!.accountId);
    expect((await call(1, 'provision')).json<{ accountId: string }>().accountId).toBe(bodies[0]!.accountId);
    await db.query('update credit_accounts set total_balance=1 where id=$1', [bodies[0]!.accountId]);
    expect((await call(3, 'close')).statusCode).toBe(409);
    await db.query('update credit_accounts set total_balance=0 where id=$1', [bodies[0]!.accountId]);
    expect((await call(3, 'close')).statusCode).toBe(200);
    for (const i of [0, 1, 2]) expect((await call(i, 'provision')).statusCode).toBe(404);
    const returning = (await call(0, 'provision', randomUUID())).json<{ accountId: string; customerId: string }>();
    expect(returning.accountId).not.toBe(bodies[0]!.accountId); expect(returning.customerId).not.toBe(bodies[0]!.customerId);
    const states = await db.query<{ status: string }>('select status from customer_application_memberships where issuer=$1 and subject=$2', [issuer, subject]);
    expect(states.rows.map(r => r.status)).toEqual(['closed', 'closed', 'closed']);
    const rotated = { ...credentials[0]!, token: '5'.repeat(43) };
    await registerIdentityNamespaces(db, [rotated]);
    await expect(registerIdentityNamespaces(db, [{ ...rotated, issuer: issuer + '-changed' }])).rejects.toThrow('reassignment');
    await expect(registerIdentityNamespaces(db, [{ ...rotated, identityMode: 'isolated' }])).rejects.toThrow('reassignment');
    expect((await db.query<{ issuer: string }>('select issuer from customer_application_namespaces where application=$1', ['simulation'])).rows[0]?.issuer).toBe(issuer);
  } finally { await app.close(); await db.close(); }
});

it('closure releases phone and username without resurrecting the old wallet', async () => {
  const db = createDatabase(loadEnv());
  const token = 'c'.repeat(43);
  const issuer = 'closure-' + randomUUID();
  const app = await buildPrivateApp(db, [{ token, application: 'simulation', issuer, onboarding: 'self_service', permissions: ['provision', 'balance', 'close'] }]);
  const subject = randomUUID(), returning = randomUUID();
  const call = (subject: string, action: string) => app.inject({ method: 'POST', url: '/v1/customer', headers: { authorization: 'Bearer ' + token }, payload: { subject, action } });
  try {
    const original = (await call(subject, 'provision')).json<{ customerId: string; accountId: string }>();
    const phone = randomUUID().replaceAll('-', '').slice(0, 24), username = randomUUID();
    await db.query('update users set phone = $1, username = $2 where id = $3', [phone, username, original.customerId]);
    await db.query("update credit_accounts set total_balance = 1 where id = $1", [original.accountId]);
    expect((await call(subject, 'close')).statusCode).toBe(409);
    expect((await db.query<{ phone: string }>('select phone from users where id = $1', [original.customerId])).rows[0]?.phone).toBe(phone);
    await db.query("update credit_accounts set total_balance = 0 where id = $1", [original.accountId]);
    await db.query("insert into platform_admins (user_id) values ($1)", [original.customerId]);
    expect((await call(subject, 'close')).statusCode).toBe(409);
    await db.query("update platform_admins set status = 'disabled' where user_id = $1", [original.customerId]);
    expect((await call(subject, 'close')).statusCode).toBe(200);
    expect((await call(subject, 'close')).statusCode).toBe(200);
    expect((await call(subject, 'provision')).statusCode).toBe(404);
    expect((await call(subject, 'balance')).statusCode).toBe(404);
    const next = (await call(returning, 'provision')).json<{ customerId: string; accountId: string }>();
    expect(next.customerId).not.toBe(original.customerId);
    expect(next.accountId).not.toBe(original.accountId);
    await db.query('update users set phone = $1, username = $2 where id = $3', [phone, username, next.customerId]);
    const old = await db.query<{ phone: string | null; status: string }>('select phone, status from users where id = $1', [original.customerId]);
    expect(old.rows[0]).toMatchObject({ phone: null, status: 'closed' });
    const neverProvisioned = randomUUID();
    expect((await call(neverProvisioned, 'close')).statusCode).toBe(200);
    expect((await call(neverProvisioned, 'provision')).statusCode).toBe(404);
  } finally { await app.close(); await db.close(); }
});

it('database prevents a second wallet for the same owner and currency', async () => {
  const db = createDatabase(loadEnv());
  try {
    const user = await db.query("insert into users (status) values ('active')");
    await db.query("insert into credit_accounts (user_id, account_scope) values ($1, 'personal')", [user.insertId]);
    await expect(db.query("insert into credit_accounts (user_id, account_scope) values ($1, 'personal')", [user.insertId])).rejects.toThrow();
  } finally { await db.close(); }
});

it('three applications isolate identical subjects, rotated credentials and closure', async () => {
  const db = createDatabase(loadEnv());
  const namespace = randomUUID(), subject = randomUUID();
  const credentials = ['simulation', 'atlas-simulation', 'atlas-modern-ai'].map((application, i) => ({
    token: String(i + 1).repeat(43), application, issuer: application + '-' + namespace,
    onboarding: 'self_service' as const, permissions: ['provision', 'balance', 'close'] as ('provision' | 'balance' | 'close')[]
  }));
  const rotated = { ...credentials[0]!, token: '4'.repeat(43), permissions: ['balance'] as 'balance'[] };
  const app = await buildPrivateApp(db, [...credentials, rotated]);
  const call = (token: string, action: string, extra = {}) => app.inject({ method: 'POST', url: '/v1/customer',
    headers: { authorization: 'Bearer ' + token }, payload: { subject, action, ...extra } });
  try {
    const replies = await Promise.all(credentials.map(c => call(c.token, 'provision')));
    expect(replies.map(r => r.statusCode)).toEqual([200, 200, 200]);
    const customers = replies.map(r => r.json<{ customerId: string; accountId: string }>());
    expect(new Set(customers.map(c => c.customerId)).size).toBe(3);
    expect(new Set(customers.map(c => c.accountId)).size).toBe(3);
    expect((await call(rotated.token, 'balance')).json()).toEqual(replies[0]!.json());
    expect((await call(credentials[1]!.token, 'close', { issuer: credentials[0]!.issuer })).statusCode).toBe(400);
    expect((await call(credentials[1]!.token, 'close')).statusCode).toBe(200);
    expect((await call(credentials[1]!.token, 'provision')).statusCode).toBe(404);
    for (const i of [0, 2]) {
      const remaining = await call(credentials[i]!.token, 'balance');
      expect(remaining.statusCode).toBe(200);
      expect(remaining.json()).toEqual(replies[i]!.json());
    }
    const states = await db.query<{ user_id: number; status: string }>(
      `select e.user_id, u.status from customer_external_identities e join users u on u.id=e.user_id
       where e.subject=$1 order by e.user_id`, [subject]);
    expect(states.rows).toHaveLength(3);
    expect(states.rows.filter(r => r.status === 'closed')).toHaveLength(1);
  } finally { await app.close(); await db.close(); }
});

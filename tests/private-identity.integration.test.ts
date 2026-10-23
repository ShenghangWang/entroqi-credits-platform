import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/pool.js';
import { buildPrivateApp } from '../src/private-api.js';
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

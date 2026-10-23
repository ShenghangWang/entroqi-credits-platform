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
  const subject = randomUUID();
  const call = (key = token) => app.inject({ method: 'POST', url: '/v1/customer', headers: { authorization: 'Bearer ' + key }, payload: { subject, action: 'provision' } });
  try {
    const replies = await Promise.all(Array.from({ length: 12 }, () => call()));
    expect(replies.map(r => r.statusCode)).toEqual(Array(12).fill(200));
    const bodies = replies.map(r => r.json());
    expect(new Set(bodies.map(b => b.accountId)).size).toBe(1);
    expect(bodies[0]).toMatchObject({ total: '0.0000', reserved: '0.0000', available: '0.0000' });
    const other = await call(second);
    expect(other.statusCode).toBe(200);
    expect(other.json().accountId).not.toBe(bodies[0].accountId);
    const count = await db.query<{ count: number }>('select count(*) as count from credit_accounts where user_id = $1', [bodies[0].customerId]);
    expect(Number(count.rows[0]?.count)).toBe(1);
  } finally { await app.close(); await db.close(); }
});

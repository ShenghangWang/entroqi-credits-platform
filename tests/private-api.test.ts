import { describe, it, expect } from 'vitest';
import { buildPrivateApp, parseCredentials, type ServiceCredential } from '../src/private-api.js';
import type { Database } from '../src/db/pool.js';
const token = 'a'.repeat(43);
const credential: ServiceCredential = { token, application: 'simulation', issuer: 'simulation-v1', onboarding: 'self_service', permissions: ['provision', 'balance'] };
const db = { query: () => Promise.reject(new Error('Unexpected DB access')), withTransaction: () => Promise.reject(new Error('offline')), close: async () => {} } as Database;
describe('private service boundary', () => {
  it('requires explicit strong unique credentials and consistent issuer policy', () => {
    expect(() => parseCredentials('[]')).toThrow();
    expect(() => parseCredentials(JSON.stringify([{ ...credential, token: 'short' }]))).toThrow();
    expect(() => parseCredentials(JSON.stringify([credential, credential]))).toThrow();
    expect(() => parseCredentials(JSON.stringify([credential, { ...credential, token: 'b'.repeat(43), onboarding: 'managed' }]))).toThrow();
  });
  it('rejects anonymous, forged fields, read-only provisioning and legacy routes', async () => {
    const app = await buildPrivateApp(db, [credential, { ...credential, token: 'b'.repeat(43), permissions: ['balance'] }]);
    try {
      const payload = { subject: 'verified-user', action: 'provision' };
      expect((await app.inject({ method: 'POST', url: '/v1/customer', payload })).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${token}` };
      for (const field of ['userId', 'application', 'issuer', 'role', 'balance', 'onboarding']) {
        expect((await app.inject({ method: 'POST', url: '/v1/customer', headers, payload: { ...payload, [field]: 'forged' } })).statusCode).toBe(400);
      }
      expect((await app.inject({ method: 'POST', url: '/v1/customer', headers: { authorization: 'Bearer ' + 'b'.repeat(43) }, payload })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/v1/customer', headers, payload })).statusCode).toBe(503);
      for (const url of ['/billing/freeze', '/integration/applications', '/payment-orders', '/admin/accounts', '/agents']) {
        expect((await app.inject({ method: 'POST', url, headers, payload: {} })).statusCode).toBe(404);
      }
    } finally { await app.close(); }
  });
});

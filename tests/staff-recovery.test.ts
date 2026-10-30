import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, chmod, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStaffDocument } from '../src/back-office/staff-document.js';
import { initializeStaffCredentials, recoverDeveloperCredential, checkRecoveredCredential } from '../src/back-office/credential-maintenance.js';
import { createOperatorSource, readPrivateFile, StaffLoginThrottle } from '../src/back-office/operator-source.js';
import { buildPrivateApp } from '../src/private-api.js';
import type { Database } from '../src/db/pool.js';
import type { PlatformOperator } from '../src/back-office/operators.js';

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const owner: PlatformOperator = { id: 'owner', token: 'o'.repeat(43), applications: ['simulation', 'atlas-ai'], role: 'developer' };
const admin: PlatformOperator = { id: 'admin', token: 'a'.repeat(43), applications: ['simulation'], role: 'admin' };
const service = { token: 's'.repeat(43), application: 'simulation', issuer: 'recovery-fixture', onboarding: 'self_service' as const, permissions: ['catalog' as const] };
const db: Database = { query: () => Promise.reject(new Error('Recovery must not query financial data')), withTransaction: () => Promise.reject(new Error('Recovery must not write financial data')), close: () => Promise.resolve() };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'credits-staff-recovery-')); directories.push(directory); await chmod(directory, 0o700);
  const file = join(directory, 'operators.json'), output = join(directory, 'new-credential.json');
  await initializeStaffCredentials(file, [owner, admin]); return { directory, file, output };
}
const origin = 'http://127.0.0.1:3100';

it('recovers the developer without the forgotten secret, preserves privileges and records no credential in the audit', async () => {
  const { file, output } = await fixture();
  await recoverDeveloperCredential(file, owner.id, output, 'INC-123 verified owner recovery');
  const rows = parseStaffDocument(await readPrivateFile(file)).operators;
  expect(rows[0]).toMatchObject({ id: owner.id, role: owner.role, applications: owner.applications });
  expect(rows[0]!.token).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(rows[0]!.token).not.toBe(owner.token);
  expect(rows[1]).toEqual(admin);
  expect(await checkRecoveredCredential(file, output)).toBe(true);
  const audit = await readFile(file + '.audit.jsonl', 'utf8');
  expect(audit).toContain('developer_recovery_requested'); expect(audit).toContain('developer_recovery_completed');
  expect(audit).not.toContain(owner.token); expect(audit).not.toContain(rows[0]!.token);
  expect((await stat(file)).mode & 0o777).toBe(0o600); expect((await stat(output)).mode & 0o777).toBe(0o600);
  await recoverDeveloperCredential(file, owner.id, output + '.next', 'INC-124 later recovery');
  expect(await checkRecoveredCredential(file, output)).toBe(false);
});
it('invalidates old sessions and bearer credentials on every service instance while unrelated admin sessions survive', async () => {
  const { file, output } = await fixture();
  const apps = await Promise.all([buildPrivateApp(db, [service], [], [owner], file), buildPrivateApp(db, [service], [], [], file)]);
  const cookies: string[] = [];
  try {
    for (const app of apps) {
      const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: owner.id, password: owner.token } });
      expect(login.statusCode).toBe(200); cookies.push(String(login.headers['set-cookie']).split(';')[0]!);
    }
    const adminLogin = await apps[0].inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: admin.id, password: admin.token } });
    const adminCookie = String(adminLogin.headers['set-cookie']).split(';')[0]!;
    await recoverDeveloperCredential(file, owner.id, output, 'INC-125 owner verified by operations');
    const receipt = JSON.parse(await readPrivateFile(output)) as { token: string };
    for (const [index, app] of apps.entries()) {
      expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie: cookies[index]! } })).statusCode).toBe(401);
      expect((await app.inject({ url: '/v1/platform/data', headers: { authorization: 'Bearer ' + owner.token } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: owner.id, password: owner.token } })).statusCode).toBe(401);
      const next = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: owner.id, password: receipt.token, role: 'agent' } });
      expect(next.statusCode).toBe(200); expect(next.json()).toMatchObject({ data: { userInfo: { role: 'developer' } } });
    }
    expect((await apps[0].inject({ url: '/api/v1/auth/me', headers: { cookie: adminCookie } })).statusCode).toBe(200);
  } finally { await Promise.all(apps.map(app => app.close())); }
});
it('never falls back to an old environment credential when the authoritative file is unreadable or corrupt', async () => {
  const { file } = await fixture();
  const app = await buildPrivateApp(db, [service], [], [owner], file);
  try {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: owner.id, password: owner.token } });
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    await writeFile(file, 'not-json', { mode: 0o600 });
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: owner.id, password: owner.token } })).statusCode).toBe(503);
    await writeFile(file, JSON.stringify([owner, admin]), { mode: 0o600 });
    expect((await app.inject({ url: '/api/v1/auth/me', headers: { cookie } })).statusCode).toBe(401);
  } finally { await app.close(); }
});
it('rejects unsafe secret files, source/token collisions and permissions before accepting a login source', async () => {
  const { file, directory } = await fixture();
  const link = join(directory, 'symlink.json'); await symlink(file, link);
  await expect(readPrivateFile(link)).rejects.toThrow();
  await chmod(file, 0o644); await expect(readPrivateFile(file)).rejects.toThrow(); await chmod(file, 0o600);
  await expect(createOperatorSource([], file, [owner.token]).read()).rejects.toThrow(/separate/);
  await writeFile(file, 'x'.repeat(65_537), { mode: 0o600 }); await expect(readPrivateFile(file)).rejects.toThrow();
});
it('cannot overwrite enrollment, receipts, audit or lock files, create an owner or elevate a lower role', async () => {
  const { file, output } = await fixture();
  await expect(initializeStaffCredentials(file, [owner])).rejects.toThrow();
  const before = await readPrivateFile(file);
  await expect(recoverDeveloperCredential(file, admin.id, output, 'INC-126 invalid role')).rejects.toThrow(/existing developer/);
  await expect(recoverDeveloperCredential(file, 'missing', output, 'INC-126 absent account')).rejects.toThrow(/existing developer/);
  await expect(recoverDeveloperCredential(file, owner.id, file + '.audit.jsonl', 'INC-126 bad path')).rejects.toThrow();
  await writeFile(output, 'existing', { mode: 0o600 });
  await expect(recoverDeveloperCredential(file, owner.id, output, 'INC-126 existing receipt')).rejects.toThrow();
  expect(await readPrivateFile(file)).toBe(before);
});
it('serializes concurrent recoveries and stops if the audit sink is unsafe', async () => {
  const { file, output } = await fixture();
  const results = await Promise.allSettled([recoverDeveloperCredential(file, owner.id, output, 'INC-127 recovery one'), recoverDeveloperCredential(file, owner.id, output + '.two', 'INC-127 recovery two')]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  const before = await readPrivateFile(file);
  await chmod(file + '.audit.jsonl', 0o644);
  await expect(recoverDeveloperCredential(file, owner.id, output + '.three', 'INC-128 unsafe audit')).rejects.toThrow();
  expect(await readPrivateFile(file)).toBe(before);
});
it('provides generic public recovery guidance without a remote reset endpoint or account enumeration', async () => {
  const app = await buildPrivateApp(db, [service], [], [owner]);
  try {
    const known = await app.inject({ url: '/api/v1/auth/recovery-options?username=owner' });
    const unknown = await app.inject({ url: '/api/v1/auth/recovery-options?username=nobody' });
    expect(known.json<{data:unknown}>().data).toEqual(unknown.json<{data:unknown}>().data);
    expect(known.body).not.toContain('"' + owner.id + '"'); expect(known.body).not.toContain(owner.token);
    for (const url of ['/api/v1/auth/reset-password', '/api/v1/auth/recover', '/api/v1/auth/recovery-options']) {
      expect((await app.inject({ method: 'POST', url, payload: { username: owner.id, role: 'developer' } })).statusCode).toBe(404);
    }
  } finally { await app.close(); }
});
it('throttles login from the actual socket IP despite forged forwarding headers and recovers after the window', async () => {
  const limiter = new StaffLoginThrottle();
  for (let i = 0; i < 20; i++) expect(limiter.take('peer', 1)).toBe(true);
  expect(limiter.take('peer', 2)).toBe(false); expect(limiter.take('peer', 60_002)).toBe(true);
  const app = await buildPrivateApp(db, [service], [], [owner]);
  try {
    for (let i = 0; i < 21; i++) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin, 'x-forwarded-for': '203.0.113.' + i }, payload: { username: 'unknown', password: 'w'.repeat(43) } });
      expect(response.statusCode).toBe(i < 20 ? 401 : 429);
    }
  } finally { await app.close(); }
});

it('retains Secure cookies behind trusted HTTPS termination and exposes only a configured company reset URL', async () => {
  vi.stubEnv('CREDITS_CONSOLE_ORIGINS', 'https://credits.example.test');
  vi.stubEnv('CREDITS_COMPANY_ACCOUNT_RECOVERY_URL', 'https://company.example.test/?account=recover');
  const app = await buildPrivateApp(db, [service], [], [owner]);
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://credits.example.test' }, payload: { username: owner.id, password: owner.token } });
    expect(response.statusCode).toBe(200); expect(String(response.headers['set-cookie'])).toContain('; Secure');
    const options = await app.inject({ url: '/api/v1/auth/recovery-options' });
    expect(options.json()).toMatchObject({ data: { companyAccountRecoveryUrl: 'https://company.example.test/?account=recover' } });
  } finally { await app.close(); }
});
it('refuses executable, credential-bearing, token-bearing and non-TLS external recovery URLs', async () => {
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.test/', 'https://example.test/?token=secret', 'http://example.test/recover']) {
    vi.stubEnv('CREDITS_COMPANY_ACCOUNT_RECOVERY_URL', url);
    await expect(buildPrivateApp(db, [service], [], [owner])).rejects.toThrow();
  }
});

import { queueStaffAudit } from './staff-administration.js';
import { constants } from 'node:fs';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import { parsePlatformOperators, type PlatformOperator } from './operators.js';
import { readPrivateFile, operatorFingerprint } from './operator-source.js';
import { parseStaffDocument, serializeStaffDocument } from './staff-document.js';

export async function privateParent(file: string) {
  if (!isAbsolute(file)) throw new Error('Use an absolute private path');
  const stat = await lstat(dirname(file));
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Create an owner-only directory (0700) first');
}
async function createPrivate(file: string, content: string) {
  await privateParent(file);
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(file: string) {
  const handle = await open(dirname(file), constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}
export async function atomicReplace(file: string, content: string) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await createPrivate(temporary, content); await rename(temporary, file); await syncDirectory(file); }
  finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function withLock<T>(file: string, operation: () => Promise<T>) {
  const lock = file + '.lock';
  await createPrivate(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try { return await operation(); }
  finally { await unlink(lock); }
}
export async function audit(file: string, event: Record<string, unknown>) {
  const handle = await open(file + '.audit.jsonl', constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Audit log must be a private regular file');
    await handle.writeFile(JSON.stringify({ at: new Date().toISOString(), actor: userInfo().username, ...event }) + '\n', 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
}
const serialize = (operators: PlatformOperator[]) => JSON.stringify(operators, null, 2) + '\n';

// Host/secret-manager administrator authority is the recovery factor. No HTTP
// caller, email address, customer role or existing web session can invoke this.
export async function initializeStaffCredentials(file: string, input: PlatformOperator[]) {
  const operators = parsePlatformOperators(serialize(input));
  if (!operators.some(row => (row.role ?? 'developer') === 'developer')) throw new Error('Configure at least one developer before initialization');
  await privateParent(file);
  await withLock(file, async () => {
    await createPrivate(file, serialize(operators));
    await audit(file, { event: 'staff_credentials_initialized', eventId: randomUUID(), operatorIds: operators.map(row => row.id) });
    await syncDirectory(file);
  });
}
export async function recoverDeveloperCredential(file: string, operatorId: string, output: string, reason: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(operatorId) || typeof reason !== 'string' || reason.trim().length < 8 || reason.length > 160 || [...reason].some(char => char.charCodeAt(0) < 32)) throw new Error('Specify the developer ID and a short incident/change reason (8–160 characters, no secrets)');
  await privateParent(file); await privateParent(output);
  if ([file, file + '.lock', file + '.audit.jsonl'].some(reserved => resolve(reserved) === resolve(output))) throw new Error('Recovery output must be separate from credentials, lock and audit files');
  return withLock(file, async () => {
    const document = parseStaffDocument(await readPrivateFile(file));
    const operators = document.operators;
    const operator = operators.find(row => row.id === operatorId);
    if (!operator || (operator.role ?? 'developer') !== 'developer') throw new Error('Recovery can rotate an existing developer only; it cannot create accounts or elevate roles');
    const token = randomBytes(32).toString('base64url'), eventId = randomUUID();
    // Save privately before changing the authoritative file, so a crash cannot
    // destroy the only copy of a successfully rotated credential. Existing
    // output files are never overwritten. Check verifies interrupted outcomes.
    await createPrivate(output, JSON.stringify({ operatorId, token, eventId, createdAt: new Date().toISOString(), notice: 'Verify against the authoritative credential file before use; import into your password manager, then remove this staging file.' }, null, 2) + '\n');
    await syncDirectory(output);
    await audit(file, { event: 'developer_recovery_requested', eventId, operatorId, reason: reason.trim() });
    operator.token = token;
    if (document.ownerRecovery?.ownerId === operatorId) {
      document.ownerRecovery.status = 'pending'; document.ownerRecovery.backupHash = null; document.ownerRecovery.pendingBackupHash = null;
      document.ownerRecovery.challenges = []; document.ownerRecovery.ticket = null;
      document.ownerRecovery.outbox = document.ownerRecovery.outbox.filter(row => row.purpose === 'changed');
      document.ownerRecovery.credentialFingerprint = operatorFingerprint(operator);
    }
    queueStaffAudit(document,{actorId:'server-admin',action:'owner.credential_recovered',targetId:operator.id,reason:reason.trim(),details:{status:'offline_recovery'}});
    await atomicReplace(file, serializeStaffDocument(document));
    await audit(file, { event: 'developer_recovery_completed', eventId, operatorId, reason: reason.trim(), sessions: 'previous credential and sessions rejected on next request' });
    return { operatorId, eventId, credentialFile: output };
  });
}
export async function checkRecoveredCredential(file: string, receipt: string): Promise<boolean> {
  const operators = parseStaffDocument(await readPrivateFile(file)).operators;
  const parsed: unknown = JSON.parse(await readPrivateFile(receipt));
  if (!parsed || typeof parsed !== 'object' || !('operatorId' in parsed) || !('token' in parsed) || typeof parsed.operatorId !== 'string' || typeof parsed.token !== 'string') throw new Error('Invalid recovery receipt');
  const found = operators.find(row => row.id === parsed.operatorId);
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return Boolean(found && timingSafeEqual(digest(found.token), digest(parsed.token)));
}

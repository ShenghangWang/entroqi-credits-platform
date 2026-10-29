import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { PlatformOperator } from './operators.js';
import { parseStaffDocument } from './staff-document.js';

// File-mode credentials come only from this authoritative secret file. Never
// fall back to an old environment credential after a rotation or read failure.
export interface OperatorSource { read(): Promise<PlatformOperator[]>; managed: boolean; file?: string }
export async function readPrivateFile(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Private credential path must be absolute');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65_536 || (stat.mode & 0o077) !== 0 ||
        typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('Private credential file must be owner-only, regular and bounded');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export function createOperatorSource(initial: PlatformOperator[], file?: string, reservedTokens: string[] = []): OperatorSource {
  const validate = (rows: PlatformOperator[]) => {
    if (rows.some(row => reservedTokens.includes(row.token))) throw new Error('Platform operator credentials must be separate from application credentials');
    return rows;
  };
  validate(initial);
  return {
    managed: Boolean(file),
    ...(file ? { file } : {}),
    async read() { return validate(file ? parseStaffDocument(await readPrivateFile(file)).operators : structuredClone(initial)); },
  };
}
export function operatorFingerprint(operator: PlatformOperator): string {
  const identity:unknown[]=[operator.id,operator.token,operator.role ?? 'developer',[...operator.applications].sort(),operator.subject ?? null];
  if(operator.pricingPermissions)identity.push([...operator.pricingPermissions].sort());
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

// Bounded per-process admission before credential comparison. Socket peer IP,
// never a caller-supplied forwarded header. Production also limits at ingress.
export class StaffLoginThrottle {
  private buckets = new Map<string, { expires: number; count: number }>();
  take(ip: string, now = Date.now()): boolean {
    for (const [key, value] of this.buckets) if (value.expires <= now) this.buckets.delete(key);
    const current = this.buckets.get(ip);
    if (current) { if (current.count >= 20) return false; current.count++; return true; }
    if (this.buckets.size >= 2048) return false;
    this.buckets.set(ip, { expires: now + 60_000, count: 1 }); return true;
  }
}

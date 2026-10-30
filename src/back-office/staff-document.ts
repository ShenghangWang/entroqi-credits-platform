import { parsePlatformOperators, type PlatformOperator } from './operators.js';
export interface RecoveryChallenge { id: string; purpose: 'enroll' | 'recover'; hash: string; expiresAt: number; attempts: number; delivered: boolean }
export interface RecoveryMail { id: string; purpose: 'enroll' | 'recover' | 'changed'; cipher: string; expiresAt: number; nextAt: number; attempts: number }
export interface OwnerRecoveryState {
  ownerId: string; email: string; status: 'pending' | 'verified' | 'active'; keyFingerprint: string;
  credentialFingerprint: string; backupHash: string | null; pendingBackupHash: string | null;
  challenges: RecoveryChallenge[]; ticket: { hash: string; expiresAt: number } | null;
  requests: { key: string; at: number }[]; outbox: RecoveryMail[];
  mailDay: string; mailCount: number; lastRecoveryAt: number | null; lastRecoveryEventId: string | null;
}
export interface StaffAuditEvent { id:string; at:number; actorId:string; action:string; targetId:string; reason:string; details:Record<string,unknown> }
export interface OwnerCreationReceipt { key:string; actorId:string; requestHash:string; targetId:string; eventId:string }
export interface StaffDocument { schemaVersion: 1; operators: PlatformOperator[]; ownerRecovery?: OwnerRecoveryState; auditOutbox?:StaffAuditEvent[]; ownerCreations?:OwnerCreationReceipt[] }
export function normalizeRecoveryEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) throw new Error('Invalid recovery email');
  return email;
}
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function parseStaffDocument(raw: string): StaffDocument {
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return { schemaVersion: 1, operators: parsePlatformOperators(raw) };
  if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed) || parsed.schemaVersion !== 1 || !('operators' in parsed) || Object.keys(parsed).some(key => !['schemaVersion', 'operators', 'ownerRecovery','auditOutbox','ownerCreations'].includes(key))) throw new Error('Invalid staff document');
  const document = parsed as StaffDocument;
  parsePlatformOperators(JSON.stringify(document.operators));
  if(document.auditOutbox !== undefined && (!Array.isArray(document.auditOutbox) || document.auditOutbox.length>64 || document.auditOutbox.some(e=>!e || Object.keys(e).sort().join(',')!=='action,actorId,at,details,id,reason,targetId' || !/^[a-f0-9-]{36}$/.test(e.id) || !integer(e.at) || !/^[A-Za-z0-9_-]{1,64}$/.test(e.actorId) || !/^owner\.[a-z_]{1,40}$/.test(e.action) || !/^[A-Za-z0-9_-]{1,64}$/.test(e.targetId) || typeof e.reason!=='string' || e.reason.length>300 || !e.details || typeof e.details!=='object' || Array.isArray(e.details) || Object.keys(e.details).some(k=>!['displayName','applications','pricingPermissions','previousStatus','status'].includes(k)) || JSON.stringify(e.details).length>1000))) throw new Error('Invalid staff audit outbox');
  if(document.ownerCreations !== undefined && (!Array.isArray(document.ownerCreations) || document.ownerCreations.length>16 || document.ownerCreations.some(e=>!e || !/^[a-f0-9-]{36}$/.test(e.key) || !hash(e.requestHash) || !/^[A-Za-z0-9_-]{1,64}$/.test(e.actorId) || !/^[A-Za-z0-9_-]{1,64}$/.test(e.targetId) || !/^[a-f0-9-]{36}$/.test(e.eventId)))) throw new Error('Invalid owner creation receipt');
  const state = document.ownerRecovery;
  if (state !== undefined) {
    if (!state || typeof state !== 'object' || !document.operators.some(row => row.id === state.ownerId && (row.role ?? 'developer') === 'developer') ||
      typeof state.email !== 'string' || normalizeRecoveryEmail(state.email) !== state.email || !['pending', 'verified', 'active'].includes(state.status) ||
      ![state.keyFingerprint, state.credentialFingerprint].every(value => value === '' || hash(value)) ||
      ![state.backupHash, state.pendingBackupHash].every(value => value === null || hash(value)) ||
      state.status === 'active' && !hash(state.backupHash) ||
      !Array.isArray(state.challenges) || state.challenges.length > 8 || state.challenges.some(row => !row || !/^[A-Za-z0-9_-]{43}$/.test(row.id) || !['enroll','recover'].includes(row.purpose) || !hash(row.hash) || !integer(row.expiresAt) || !integer(row.attempts) || typeof row.delivered !== 'boolean') ||
      state.ticket !== null && (!state.ticket || !hash(state.ticket.hash) || !integer(state.ticket.expiresAt)) ||
      !Array.isArray(state.requests) || state.requests.length > 128 || state.requests.some(row => !row || !hash(row.key) || !integer(row.at)) ||
      !Array.isArray(state.outbox) || state.outbox.length > 16 || state.outbox.some(row => !row || !/^[A-Za-z0-9_-]{43}$/.test(row.id) || !['enroll','recover','changed'].includes(row.purpose) || typeof row.cipher !== 'string' || !/^[A-Za-z0-9_-]{1,4096}$/.test(row.cipher) || ![row.expiresAt,row.nextAt,row.attempts].every(integer)) ||
      typeof state.mailDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.mailDay) || !integer(state.mailCount) || state.lastRecoveryAt !== null && !integer(state.lastRecoveryAt) || state.lastRecoveryEventId !== null && (typeof state.lastRecoveryEventId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state.lastRecoveryEventId))) throw new Error('Invalid owner recovery state');
  }
  return document;
}
export function serializeStaffDocument(document: StaffDocument): string {
  const raw = JSON.stringify(document.ownerRecovery || document.auditOutbox || document.ownerCreations ? document : document.operators, null, 2) + '\n';
  if (Buffer.byteLength(raw) > 65_536) throw new Error('Staff document capacity exceeded');
  parseStaffDocument(raw); return raw;
}

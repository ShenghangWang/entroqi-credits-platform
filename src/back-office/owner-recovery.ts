import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { atomicReplace, withLock, audit } from './credential-maintenance.js';
import { readPrivateFile, operatorFingerprint } from './operator-source.js';
import { normalizeRecoveryEmail, parseStaffDocument, serializeStaffDocument, type StaffDocument, type OwnerRecoveryState } from './staff-document.js';
import type { PlatformOperator } from './operators.js';
import type { OwnerMail, OwnerMailSender } from './recovery-mail.js';

const nonce = () => randomBytes(32).toString('base64url');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(digest(a),'hex'), Buffer.from(digest(b),'hex'));
const newCode = () => String(randomInt(0,100_000_000)).padStart(8,'0');
export class RecoveryUnavailable extends Error {}
export class OwnerRecoveryDenied extends Error {}
export class OwnerRecoveryService {
  readonly senderReady: boolean;
  private encryptionKey: Buffer;
  private macKey: Buffer;
  private keyFingerprint: string;
  constructor(private file: string, key: string, private sender?: OwnerMailSender, private now = Date.now) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Configure a private 256-bit owner recovery key');
    const raw = Buffer.from(key,'base64url');
    if (raw.length !== 32) throw new Error('Invalid owner recovery key');
    this.encryptionKey = createHmac('sha256',raw).update('owner-recovery-encryption-v1').digest();
    this.macKey = createHmac('sha256',raw).update('owner-recovery-verification-v1').digest();
    this.keyFingerprint = digest(key); this.senderReady = Boolean(sender);
  }
  private mac(value: string) { return createHmac('sha256',this.macKey).update(value).digest('hex'); }
  private encrypt(mail: OwnerMail) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',this.encryptionKey,iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(mail),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  private decrypt(value: string): OwnerMail {
    const bytes = Buffer.from(value,'base64url'), decipher = createDecipheriv('aes-256-gcm',this.encryptionKey,bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) as OwnerMail;
  }
  private async mutate<T>(operation: (document: StaffDocument) => Promise<T> | T): Promise<T> {
    return withLock(this.file, async () => {
      const document = parseStaffDocument(await readPrivateFile(this.file));
      const result = await operation(document);
      await atomicReplace(this.file,serializeStaffDocument(document)); return result;
    });
  }
  private state(document: StaffDocument) {
    const state = document.ownerRecovery;
    const owner = document.operators.find(row => row.id === state?.ownerId && (row.role ?? 'developer') === 'developer');
    if (!state || !owner || state.keyFingerprint !== this.keyFingerprint) throw new RecoveryUnavailable('Owner recovery is not enrolled');
    if (state.credentialFingerprint !== operatorFingerprint(owner)) throw new RecoveryUnavailable('Owner recovery must be re-enrolled');
    const now = this.now();
    state.requests = state.requests.filter(row => row.at > now - 900_000);
    state.challenges = state.challenges.filter(row => row.expiresAt > now && row.attempts < 5);
    state.outbox = state.outbox.filter(row => row.expiresAt > now);
    if (state.ticket && state.ticket.expiresAt <= now) state.ticket = null;
    return { state, owner };
  }
  private authorized(document: StaffDocument, actor: PlatformOperator, credential: string) {
    const { state, owner } = this.state(document);
    if (actor.id !== owner.id || operatorFingerprint(actor) !== operatorFingerprint(owner) || !equal(credential,owner.token)) throw new OwnerRecoveryDenied('Owner reauthentication required');
    return state;
  }
  private throttle(state: OwnerRecoveryState, peer: string, email: string) {
    const now = this.now(), peerKey = this.mac('peer:'+peer), emailKey = this.mac('email:'+email);
    if (state.requests.filter(row => row.key === peerKey && row.at > now - 60_000).length >= 20 ||
        state.requests.filter(row => row.key === emailKey && row.at > now - 900_000).length >= 5 || state.requests.length > 124) return false;
    state.requests.push({key:peerKey,at:now},{key:emailKey,at:now}); return true;
  }
  private queue(state: OwnerRecoveryState, kind: OwnerMail['kind'], text: string, id = nonce()) {
    if (state.outbox.length >= 16) throw new RecoveryUnavailable('Owner notification queue unavailable');
    const now = this.now();
    state.outbox.push({id,purpose:kind,cipher:this.encrypt({to:state.email,text,kind,id}),expiresAt:now+(kind==='changed'?86_400_000:600_000),nextAt:now,attempts:0});
  }
  async stage(ownerId: string, inputEmail: string) {
    const email = normalizeRecoveryEmail(inputEmail);
    await this.mutate(document => {
      const owner = document.operators.find(row => row.id===ownerId && (row.role ?? 'developer')==='developer');
      if (!owner) throw new Error('An existing company owner is required');
      if (document.ownerRecovery) {
        if (document.ownerRecovery.email !== email || document.ownerRecovery.ownerId !== ownerId) throw new Error('Recovery contact replacement needs an explicit reviewed operation');
        return;
      }
      document.ownerRecovery = {ownerId,email,status:'pending',keyFingerprint:this.keyFingerprint,credentialFingerprint:operatorFingerprint(owner),backupHash:null,pendingBackupHash:null,challenges:[],ticket:null,requests:[],outbox:[],mailDay:new Date(this.now()).toISOString().slice(0,10),mailCount:0,lastRecoveryAt:null,lastRecoveryEventId:null};
    });
  }
  async profile(actor: PlatformOperator) {
    const document=parseStaffDocument(await readPrivateFile(this.file));
    const {state,owner}=this.state(document);
    if (actor.id!==owner.id || operatorFingerprint(actor)!==operatorFingerprint(owner)) throw new OwnerRecoveryDenied('Owner only');
    return {status:state.status,mailReady:this.senderReady};
  }
  async request(emailInput: string, peer: string, actor?: PlatformOperator, credential?: string) {
    if (!this.sender) throw new RecoveryUnavailable('Email sender not configured');
    let email='invalid'; try { email=normalizeRecoveryEmail(emailInput); } catch { /* Same public outcome. */ }
    const id=nonce(), purpose=actor?'enroll':'recover';
    await this.mutate(document => {
      const {state}=this.state(document);
      if (actor) this.authorized(document,actor,credential ?? '');
      if (!this.throttle(state,peer,email)) return;
      const matches=equal(this.mac(email),this.mac(state.email));
      if (!matches || (purpose==='recover' ? state.status!=='active' : state.status==='active')) return;
      const day=new Date(this.now()).toISOString().slice(0,10);
      if(state.mailDay!==day){state.mailDay=day;state.mailCount=0;}
      if(state.mailCount>=10 || state.outbox.length>=15) return;
      // One outstanding code per purpose. Resending invalidates the previous one.
      state.challenges=state.challenges.filter(row=>row.purpose!==purpose);
      state.outbox=state.outbox.filter(row=>row.purpose!==purpose);
      const code=newCode();
      state.challenges.push({id,purpose,hash:this.mac(purpose+':'+id+':'+code),expiresAt:this.now()+600_000,attempts:0,delivered:false});
      state.mailCount++;
      this.queue(state,purpose,'公司所有者'+(purpose==='enroll'?'恢复邮箱验证':'账号恢复')+'验证码：'+code+'\n有效期10分钟。请勿向他人提供验证码。如果不是您发起的操作，请联系公司安全负责人。',id);
    });
    return {challengeId:id,message:'如果输入的信息与已登记的恢复邮箱一致，且发送条件允许，验证码将发送到该邮箱。'};
  }
  async verifyEnrollment(actor: PlatformOperator, credential: string, email: string, id: string, code: string) {
    return this.mutate(document => {
      const state=this.authorized(document,actor,credential);
      const challenge=state.challenges.find(row=>row.id===id && row.purpose==='enroll');
      if (!challenge || !challenge.delivered || state.status==='active') return null;
      challenge.attempts++;
      if(!equal(email.trim().toLowerCase(),state.email) || !equal(challenge.hash,this.mac('enroll:'+id+':'+code))) return null;
      state.challenges=[]; const backup=nonce(); state.pendingBackupHash=digest('backup:'+backup); state.status='verified';
      return {offlineRecoveryCode:backup};
    });
  }
  async activate(actor: PlatformOperator, credential: string, backup: string) {
    return this.mutate(document=>{
      const state=this.authorized(document,actor,credential);
      if(state.status!=='verified' || !state.pendingBackupHash || !equal(state.pendingBackupHash,digest('backup:'+backup))) return false;
      state.backupHash=state.pendingBackupHash;state.pendingBackupHash=null;state.status='active';
      this.queue(state,'changed','公司所有者邮箱恢复已启用。恢复需要邮箱验证码及离线恢复码。如非本人操作，请立即联系授权运维。'); return true;
    });
  }
  async verifyRecovery(email: string, id: string, code: string, backup: string, peer: string) {
    return this.mutate(document=>{
      const {state}=this.state(document);
      // Verification gets a separate persistent peer budget, independent of requests.
      const key=this.mac('verify:'+peer),now=this.now();
      if(state.requests.filter(row=>row.key===key && row.at>now-60_000).length>=20 || state.requests.length>=128) return null;
      state.requests.push({key,at:now});
      const challenge=state.challenges.find(row=>row.id===id && row.purpose==='recover');
      if(state.status!=='active' || !challenge || !challenge.delivered) return null;
      challenge.attempts++;
      const emailOk=equal(email.trim().toLowerCase(),state.email),codeOk=equal(challenge.hash,this.mac('recover:'+id+':'+code));
      const backupOk=equal(state.backupHash ?? '',digest('backup:'+backup));
      if(!emailOk || !codeOk || !backupOk) return null;
      const ticket=nonce();state.challenges=[];state.outbox=state.outbox.filter(row=>row.purpose==='changed');
      state.ticket={hash:digest(ticket),expiresAt:now+300_000}; return {resetTicket:ticket,expiresInSeconds:300};
    });
  }
  async complete(ticket: string) {
    if(!this.sender) throw new RecoveryUnavailable('Email sender not configured');
    const result=await this.mutate(async document=>{
      const {state,owner}=this.state(document);
      if(state.status!=='active' || !state.ticket || !equal(state.ticket.hash,digest(ticket))) return null;
      const eventId=nonce(),credential=nonce(),backup=nonce();
      await audit(this.file,{event:'owner_email_recovery_requested',eventId,operatorId:owner.id});
      owner.token=credential;state.backupHash=digest('backup:'+backup);state.credentialFingerprint=operatorFingerprint(owner);
      state.ticket=null;state.challenges=[];state.outbox=state.outbox.filter(row=>row.purpose==='changed');state.lastRecoveryAt=this.now();state.lastRecoveryEventId=eventId;
      this.queue(state,'changed','公司所有者登录凭证已重置。旧凭证、旧会话及旧离线恢复码现已失效。如非本人操作，请立即通过独立渠道联系授权运维。');
      return {credential,offlineRecoveryCode:backup,operatorId:owner.id,eventId};
    });
    if(result) { try { await audit(this.file,{event:'owner_email_recovery_completed',eventId:result.eventId,operatorId:result.operatorId}); } catch { /* Durable state and notification outbox retain the committed event. */ } }
    return result;
  }
  async drain() {
    if(!this.sender) return;
    const snapshot=parseStaffDocument(await readPrivateFile(this.file));
    if(!snapshot.ownerRecovery?.outbox.some(row=>row.nextAt<=this.now() && row.expiresAt>this.now() && row.attempts<12)) return;
    const claimed=await this.mutate(document=>{
      const {state}=this.state(document),now=this.now();
      const mail=state.outbox.find(row=>row.nextAt<=now && row.attempts<12);
      if(!mail)return null;mail.nextAt=now+30_000;mail.attempts++;return {...mail};
    });
    if(!claimed)return;
    let delivered=false;
    try { await this.sender(this.decrypt(claimed.cipher));delivered=true; } catch { /* Retain encrypted queue for bounded retry. */ }
    await this.mutate(document=>{
      const {state}=this.state(document),entry=state.outbox.find(row=>row.id===claimed.id);
      if(!entry)return;
      if(delivered){state.outbox=state.outbox.filter(row=>row.id!==entry.id);const challenge=state.challenges.find(row=>row.id===entry.id);if(challenge)challenge.delivered=true;}
      else entry.nextAt=this.now()+Math.min(3_600_000,30_000*2**entry.attempts);
    });
  }
}

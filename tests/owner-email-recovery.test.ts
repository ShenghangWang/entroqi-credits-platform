import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeStaffCredentials, recoverDeveloperCredential } from '../src/back-office/credential-maintenance.js';
import { readPrivateFile } from '../src/back-office/operator-source.js';
import { parseStaffDocument } from '../src/back-office/staff-document.js';
import { OwnerRecoveryService } from '../src/back-office/owner-recovery.js';
import { createOwnerMailSender, type OwnerMail } from '../src/back-office/recovery-mail.js';
import { buildPrivateApp } from '../src/private-api.js';
import type { Database } from '../src/db/pool.js';
const owner={id:'company-owner',token:'o'.repeat(43),role:'developer' as const,applications:['simulation','atlas-ai']};
const admin={id:'admin',token:'a'.repeat(43),role:'admin' as const,applications:['simulation']};
const email='owner@example.test',key='k'.repeat(43),directories:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
async function fixture(senderEnabled=true){
  const directory=await mkdtemp(join(tmpdir(),'credits-owner-mail-'));directories.push(directory);await chmod(directory,0o700);
  const file=join(directory,'staff.json'),mails:OwnerMail[]=[];let now=Date.parse('2026-10-29T00:00:00Z');
  await initializeStaffCredentials(file,[owner,admin]);
  const service=new OwnerRecoveryService(file,key,senderEnabled?mail=>{mails.push(mail);return Promise.resolve();}:undefined,()=>now);
  await service.stage(owner.id,email);
  const code=()=>mails.at(-1)!.text.match(/验证码：(\d{8})/)![1]!;
  const enroll=async()=>{
    const request=await service.request(email,'enrollment-peer',owner,owner.token);await service.drain();
    const proof=await service.verifyEnrollment(owner,owner.token,email,request.challengeId,code());expect(proof).not.toBeNull();
    expect(await service.activate(owner,owner.token,proof!.offlineRecoveryCode)).toBe(true);await service.drain();
    return proof!.offlineRecoveryCode;
  };
  const challenge=async()=>{const response=await service.request(email,'recovery-peer');await service.drain();return {...response,code:code()};};
  return {directory,file,service,mails,code,enroll,challenge,advance:(ms:number)=>{now+=ms;},clock:()=>now};
}
it('stages the address privately and cannot activate unverified email or simulate delivery without a sender',async()=>{
  const f=await fixture(false);
  expect(await f.service.profile(owner)).toEqual({status:'pending',mailReady:false});
  await expect(f.service.request(email,'peer',owner,owner.token)).rejects.toThrow(/sender/);
  expect(await f.service.activate(owner,owner.token,'arbitrary')).toBe(false);
  expect(f.mails).toHaveLength(0);
});
it('requires owner reauthentication, real mailbox proof and explicit saved-backup acknowledgment before activation',async()=>{
  const f=await fixture();
  await expect(f.service.request(email,'peer',admin,admin.token)).rejects.toThrow();
  await expect(f.service.request(email,'peer',owner,'wrong')).rejects.toThrow();
  const pending=await f.service.request(email,'peer',owner,owner.token);expect(f.mails).toHaveLength(0);
  expect(await f.service.verifyEnrollment(owner,owner.token,email,pending.challengeId,'00000000')).toBeNull();
  await f.service.drain();const otp=f.code();
  const result=await f.service.verifyEnrollment(owner,owner.token,email,pending.challengeId,otp);expect(result).not.toBeNull();
  expect(await f.service.profile(owner)).toMatchObject({status:'verified'});
  expect(await f.service.verifyEnrollment(owner,owner.token,email,pending.challengeId,otp)).toBeNull();
  expect(await f.service.activate(owner,owner.token,'wrong')).toBe(false);
  expect(await f.service.activate(owner,owner.token,result!.offlineRecoveryCode)).toBe(true);
  expect(await f.service.profile(owner)).toMatchObject({status:'active'});
  const raw=await readPrivateFile(f.file);expect(raw).not.toContain(result!.offlineRecoveryCode);expect(raw).not.toContain(otp);
});
it('never reveals a matching mailbox or sends to caller-supplied nonmatching addresses',async()=>{
  const f=await fixture();await f.enroll();
  const yes=await f.service.request(email,'peer-a'),no=await f.service.request('unregistered@example.test','peer-b');
  expect(yes.message).toBe(no.message);expect(yes.challengeId).toHaveLength(43);expect(no.challengeId).toHaveLength(43);
  expect(JSON.stringify([yes,no])).not.toContain(email);await f.service.drain();
  expect(f.mails.every(mail=>mail.to===email)).toBe(true);
  expect(await readPrivateFile(f.file)).not.toContain('unregistered@example.test');
});
it('requires both the emailed code and offline recovery code; expires and limits attempts without locking normal login',async()=>{
  const f=await fixture(),backup=await f.enroll(),request=await f.challenge();
  for(let i=0;i<5;i++)expect(await f.service.verifyRecovery(email,request.challengeId,request.code,'wrong','peer')).toBeNull();
  expect(await f.service.verifyRecovery(email,request.challengeId,request.code,backup,'peer')).toBeNull();
  const next=await f.challenge();f.advance(600_001);
  expect(await f.service.verifyRecovery(email,next.challengeId,next.code,backup,'another-peer')).toBeNull();
  expect(parseStaffDocument(await readPrivateFile(f.file)).operators[0]!.token).toBe(owner.token);
});
it('atomically rotates owner access and backup codes, preserves grants, consumes tickets and queues a notification',async()=>{
  const f=await fixture(),backup=await f.enroll(),request=await f.challenge();
  const proof=await f.service.verifyRecovery(email,request.challengeId,request.code,backup,'peer');expect(proof).not.toBeNull();
  expect(await f.service.verifyRecovery(email,request.challengeId,request.code,backup,'peer')).toBeNull();
  const reset=await f.service.complete(proof!.resetTicket);expect(reset).not.toBeNull();
  expect(reset!.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(reset!.offlineRecoveryCode).not.toBe(backup);
  expect(await f.service.complete(proof!.resetTicket)).toBeNull();
  const doc=parseStaffDocument(await readPrivateFile(f.file));
  expect(doc.operators[0]).toEqual({...owner,token:reset!.credential});expect(doc.operators[1]).toEqual(admin);
  expect(doc.ownerRecovery!.outbox.some(row=>row.purpose==='changed')).toBe(true);
  const audit=await readPrivateFile(f.file+'.audit.jsonl');expect(audit).not.toContain(email);expect(audit).not.toContain(reset!.credential);
  expect(audit).toContain('owner_email_recovery_completed');await f.service.drain();
  expect(f.mails.at(-1)!.kind).toBe('changed');
  const next=await f.challenge();expect(await f.service.verifyRecovery(email,next.challengeId,next.code,backup,'peer')).toBeNull();
});
it('invalidates already-open sessions on multiple application instances after email recovery',async()=>{
  const f=await fixture(),backup=await f.enroll();
  const db:Database={query:()=>Promise.reject(new Error('No financial query')),withTransaction:()=>Promise.reject(new Error('No financial mutation')),close:()=>Promise.resolve()};
  const service={token:'s'.repeat(43),application:'simulation',issuer:'email-recovery-fixture',onboarding:'self_service' as const,permissions:['catalog' as const]};
  const apps=await Promise.all([buildPrivateApp(db,[service],[],[],f.file),buildPrivateApp(db,[service],[],[],f.file)]);
  try{
    const cookies:string[]=[];
    for(const app of apps){const result=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://127.0.0.1:3100'},payload:{username:owner.id,password:owner.token}});expect(result.statusCode).toBe(200);cookies.push(String(result.headers['set-cookie']).split(';')[0]!);}
    const request=await f.challenge(),proof=await f.service.verifyRecovery(email,request.challengeId,request.code,backup,'peer');await f.service.complete(proof!.resetTicket);
    for(const [i,app] of apps.entries())expect((await app.inject({url:'/api/v1/auth/me',headers:{cookie:cookies[i]!}})).statusCode).toBe(401);
  }finally{await Promise.all(apps.map(app=>app.close()));}
});
it('persists encrypted mail retries across restart and never treats provider failure as delivered verification',async()=>{
  const f=await fixture();
  const broken=new OwnerRecoveryService(f.file,key,()=>Promise.reject(new Error('provider details must not escape')),f.clock);
  const request=await broken.request(email,'peer',owner,owner.token);await broken.drain();
  expect(parseStaffDocument(await readPrivateFile(f.file)).ownerRecovery!.challenges[0]!.delivered).toBe(false);
  f.advance(61_000);await f.service.drain();
  expect(await f.service.verifyEnrollment(owner,owner.token,email,request.challengeId,f.code())).not.toBeNull();
});
it('expires reset tickets and invalidates previous challenges when sending a replacement',async()=>{
  const f=await fixture(),backup=await f.enroll(),first=await f.challenge(),second=await f.challenge();
  expect(await f.service.verifyRecovery(email,first.challengeId,first.code,backup,'peer')).toBeNull();
  const proof=await f.service.verifyRecovery(email,second.challengeId,second.code,backup,'peer');expect(proof).not.toBeNull();f.advance(300_001);
  expect(await f.service.complete(proof!.resetTicket)).toBeNull();
});
it('retains the protected server-admin fallback and requires enrollment again after its credential rotation',async()=>{
  const f=await fixture();await f.enroll();
  await recoverDeveloperCredential(f.file,owner.id,join(f.directory,'new.json'),'INC-234 independent host recovery');
  const current=parseStaffDocument(await readPrivateFile(f.file)).operators[0]!;
  expect(await f.service.profile(current)).toMatchObject({status:'pending'});
  expect(parseStaffDocument(await readPrivateFile(f.file)).ownerRecovery!.backupHash).toBeNull();
});
it('bounds resend budgets and persists attempt budgets across process restarts',async()=>{
  const f=await fixture();await f.enroll();
  for(let i=0;i<25;i++)await f.service.request(email,'one-peer');
  const state=parseStaffDocument(await readPrivateFile(f.file)).ownerRecovery!;
  expect(state.mailCount).toBeLessThanOrEqual(5);expect(state.outbox.filter(row=>row.purpose==='recover')).toHaveLength(1);
});
it('uses the existing fixed Resend transport contract without automatic sends or leaking provider errors',async()=>{
  vi.stubEnv('CREDITS_RECOVERY_MAIL_PROVIDER','resend');vi.stubEnv('CREDITS_RECOVERY_MAIL_API_KEY','fixture-private-key');vi.stubEnv('CREDITS_RECOVERY_MAIL_FROM','accounts@example.test');
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('private-provider-error',{status:403}));
  const sender=createOwnerMailSender(transport)!;expect(transport).not.toHaveBeenCalled();
  await expect(sender({to:email,text:'fixture only',kind:'enroll',id:'a'.repeat(43)})).rejects.toThrow('Owner email delivery unavailable');
  expect(transport.mock.calls[0]![0]).toBe('https://api.resend.com/emails');
  const request=transport.mock.calls[0]![1]!;expect(request.redirect).toBe('error');expect(request.headers).toMatchObject({'Idempotency-Key':'credits-owner-'+'a'.repeat(43)});
});

it('protects enrollment routes, keeps the email private and truthfully reports an unconfigured sender',async()=>{
  const f=await fixture(false);vi.stubEnv('CREDITS_OWNER_RECOVERY_SECRET',key);
  const db:Database={query:()=>Promise.reject(new Error('No financial query')),withTransaction:()=>Promise.reject(new Error('No financial mutation')),close:()=>Promise.resolve()};
  const service={token:'s'.repeat(43),application:'simulation',issuer:'email-route-fixture',onboarding:'self_service' as const,permissions:['catalog' as const]};
  const app=await buildPrivateApp(db,[service],[],[],f.file),origin='http://127.0.0.1:3100';
  try{
    const options=await app.inject({url:'/api/v1/auth/recovery-options'});
    expect(options.json()).toMatchObject({data:{ownerEmailRecovery:{mailReady:false,requiresOfflineRecoveryCode:true}}});expect(options.body).not.toContain(email);
    const path='/api/v1/auth/owner-recovery/enroll/request';
    expect((await app.inject({method:'POST',url:path,headers:{origin},payload:{email,currentCredential:owner.token}})).statusCode).toBe(401);
    const adminLogin=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{username:admin.id,password:admin.token}});
    const cookie=String(adminLogin.headers['set-cookie']).split(';')[0]!;
    expect((await app.inject({url:'/api/v1/auth/owner-recovery/profile',headers:{cookie}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/owner-recovery/request',headers:{origin:'https://attacker.example'},payload:{email}})).statusCode).toBe(403);
    for(const candidate of [email,'unknown@example.test']){
      const result=await app.inject({method:'POST',url:'/api/v1/auth/owner-recovery/request',headers:{origin},payload:{email:candidate}});
      expect(result.statusCode).toBe(503);expect(result.body).not.toContain(candidate);
    }
    expect((await app.inject({method:'POST',url:'/api/v1/auth/owner-recovery/request',headers:{origin},payload:{email,role:'developer'}})).statusCode).toBe(400);
  }finally{await app.close();}
});

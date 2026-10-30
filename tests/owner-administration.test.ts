import {it,expect,afterEach,vi} from 'vitest';
import {mkdtemp,rm,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {initializeStaffCredentials} from '../src/back-office/credential-maintenance.js';import {createOwner,queueStaffAudit,type CreateOwnerInput} from '../src/back-office/staff-administration.js';
import {readPrivateFile,createOperatorSource} from '../src/back-office/operator-source.js';import {parseStaffDocument,serializeStaffDocument} from '../src/back-office/staff-document.js';import {flushStaffAudit} from '../src/back-office/audit-trail.js';
import {buildPrivateApp} from '../src/private-api.js';import type {PlatformOperator} from '../src/back-office/operators.js';import type {Database} from '../src/db/pool.js';
const services=[{token:'s'.repeat(43),application:'simulation',issuer:'owner-test-fixture',onboarding:'self_service' as const,permissions:['catalog' as const]}];
const dirs:string[]=[],origin='http://127.0.0.1:3100';afterEach(async()=>{vi.unstubAllEnvs();for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
const owner:PlatformOperator={id:'founder',token:'o'.repeat(43),applications:['simulation','atlas-ai'],pricingPermissions:['read','write','publish']},admin:PlatformOperator={id:'manager',role:'admin',token:'a'.repeat(43),applications:['simulation']};
const unavailable:Database={query:()=>Promise.reject(new Error('Audit database unavailable fixture')),withTransaction:()=>Promise.reject(new Error('Audit database unavailable fixture')),close:()=>Promise.resolve()};
const input=(overrides:Partial<CreateOwnerInput>={}):CreateOwnerInput=>({idempotencyKey:randomUUID(),username:'partner',displayName:'Partner Owner',newCredential:'p'.repeat(43),currentCredential:owner.token,reason:'Second named company owner',confirmed:true,...overrides});
async function fixture(){const d=await mkdtemp(join(tmpdir(),'credits-owners-'));dirs.push(d);await chmod(d,0o700);const file=join(d,'staff.json');await initializeStaffCredentials(file,[owner,admin]);return file;}
it('atomically creates a distinct owner, preserves the original login/scopes and records no credential in durable audit',async()=>{
 const file=await fixture(),body=input(),first=await createOwner(file,owner,body),again=await createOwner(file,owner,body);expect(again).toEqual({...first,replayed:true});
 const doc=parseStaffDocument(await readPrivateFile(file));expect(doc.operators[0]).toEqual(owner);expect(doc.operators[1]).toEqual(admin);expect(doc.operators[2]).toMatchObject({id:'partner',displayName:'Partner Owner',role:'developer',applications:owner.applications,pricingPermissions:owner.pricingPermissions});
 expect(doc.auditOutbox).toHaveLength(1);expect(doc.auditOutbox![0]).toMatchObject({actorId:'founder',action:'owner.created',targetId:'partner'});expect(JSON.stringify([doc.auditOutbox,doc.ownerCreations])).not.toContain(body.newCredential);expect(JSON.stringify([doc.auditOutbox,doc.ownerCreations])).not.toContain(body.currentCredential);
 await expect(createOwner(file,owner,{...body,displayName:'Changed'})).rejects.toThrow(/重复/);
});
it('rejects wrong/stale credentials, non-owners, case-duplicate IDs and reused application/staff tokens without changing authority',async()=>{
 const file=await fixture(),before=await readPrivateFile(file);
 for(const [actor,body,reserved] of [[owner,input({currentCredential:'x'.repeat(43)}),[]],[admin,input({currentCredential:admin.token}),[]],[{...owner,applications:['simulation']},input(),[]],[owner,input({username:'FOUNDER'}),[]],[owner,input({newCredential:admin.token}),[]],[owner,input(),['p'.repeat(43)]]] as [PlatformOperator,CreateOwnerInput,string[]][]){await expect(createOwner(file,actor,body,reserved)).rejects.toThrow();expect(await readPrivateFile(file)).toBe(before);}
});
it('serializes concurrent owner creation; retries are idempotent and a failed audit export retains the committed event',async()=>{
 const file=await fixture(),body=input(),results=await Promise.allSettled([createOwner(file,owner,body),createOwner(file,owner,body)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);await createOwner(file,owner,body);
 await expect(flushStaffAudit(file,unavailable)).rejects.toThrow();expect(parseStaffDocument(await readPrivateFile(file)).auditOutbox).toHaveLength(1);
 const doc=parseStaffDocument(await readPrivateFile(file));for(let i=1;i<64;i++)queueStaffAudit(doc,{actorId:owner.id,action:'owner.created',targetId:'fixture',reason:'Bounded audit fixture',details:{status:'pending'}});expect(()=>queueStaffAudit(doc,{actorId:owner.id,action:'owner.created',targetId:'fixture',reason:'No overflow',details:{}})).toThrow(/full/);expect(()=>serializeStaffDocument(doc)).not.toThrow();
});
it('supports independent logins across restarted instances and rejects forged roles, cross-origin creation and Admin audit access',async()=>{
 const file=await fixture(),app=await buildPrivateApp(unavailable,services,[],[],file);
 const login=async(a:typeof app,id:string,token:string)=>String((await a.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{username:id,password:token}})).headers['set-cookie']).split(';')[0]!;
 try{const cookie=await login(app,owner.id,owner.token);const body=input();
 expect((await app.inject({method:'POST',url:'/api/v1/platform/owner-administration/owners',headers:{origin,cookie},payload:{...body,role:'developer'}})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url:'/api/v1/platform/owner-administration/owners',headers:{origin:'https://foreign.example',cookie},payload:body})).statusCode).toBe(403);
 const manager=await login(app,admin.id,admin.token);expect((await app.inject({url:'/api/v1/platform/owner-administration/audit',headers:{cookie:manager}})).statusCode).toBe(403);expect((await app.inject({method:'POST',url:'/api/v1/platform/owner-administration/owners',headers:{origin,cookie:manager},payload:body})).statusCode).toBe(403);
 const result=await app.inject({method:'POST',url:'/api/v1/platform/owner-administration/owners',headers:{origin,cookie},payload:body});expect(result.statusCode).toBe(200);expect(result.body).not.toContain(body.newCredential);
 expect((await app.inject({url:'/api/v1/auth/me',headers:{cookie}})).statusCode).toBe(200);const partner=await login(app,'partner',body.newCredential);expect((await app.inject({url:'/api/v1/auth/me',headers:{cookie:partner}})).json()).toMatchObject({data:{userInfo:{id:'partner',displayName:'Partner Owner',role:'developer'}}});
 const second=await buildPrivateApp(unavailable,services,[],[],file);try{expect((await second.inject({url:'/api/v1/auth/me',headers:{cookie:await login(second,'partner',body.newCredential)}})).statusCode).toBe(200);}finally{await second.close();}
 expect((await createOperatorSource([],file).read()).filter(o=>(o.role??'developer')==='developer')).toHaveLength(2);
 }finally{await app.close();}
});

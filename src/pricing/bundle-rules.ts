import {createHash,randomUUID} from 'node:crypto';
import type {Database,DatabaseClient} from '../db/pool.js';
import {BadRequestError,ConflictError,ForbiddenError} from '../domain/errors.js';
import {companyApplications} from '../company/registry.js';
import {requestHash} from '../http/request-hash.js';
import {subscriptionPeriods,type IntervalMonths} from './subscription-terms.js';
export interface BundleRule {applications:string[];intervalMonths:IntervalMonths;discountBps:number;available:boolean;label:string;evidenceNote:string;validUntil:number}
export const decode=<T>(v:string|T):T=>typeof v==='string'?JSON.parse(v) as T:v;
export function selection(apps:unknown,months:unknown,registered:readonly string[]=companyApplications.map(a=>a.application)){
 if(!Array.isArray(apps)||apps.length<2||apps.length>32||apps.some(a=>typeof a!=='string'||!registered.includes(a))||new Set(apps).size!==apps.length||!subscriptionPeriods.some(p=>p.months===months))throw new BadRequestError('Choose 2–32 distinct registered apps and a supported common period');
 return {applications:[...apps as string[]].sort(),intervalMonths:months as IntervalMonths};
}
export const bundleKey=(s:{applications:string[];intervalMonths:number})=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
export function validateRule(value:BundleRule,now:number):BundleRule{
 if(!value||Object.keys(value).sort().join(',')!=='applications,available,discountBps,evidenceNote,intervalMonths,label,validUntil'||!Number.isInteger(value.discountBps)||value.discountBps<0||value.discountBps>9900||typeof value.available!=='boolean'||typeof value.label!=='string'||!value.label.trim()||value.label.length>160||typeof value.evidenceNote!=='string'||value.evidenceNote.trim().length<10||value.evidenceNote.length>2000||!Number.isSafeInteger(value.validUntil)||value.validUntil<0||value.validUntil>now+366*86400000||value.available&&value.validUntil<=now)throw new BadRequestError('Invalid bundle discount, expiry or review evidence');
 return {...structuredClone(value),...selection(value.applications,value.intervalMonths)};
}
export function allocateDiscount(lines:readonly {application:string;amountMinor:string}[],bps:number){
 if(!Number.isInteger(bps)||bps<0||bps>9900||!lines.length||new Set(lines.map(l=>l.application)).size!==lines.length||lines.some(l=>!/^[1-9]\d{0,15}$/.test(l.amountMinor)))throw new BadRequestError('Invalid exact-money allocation');
 const sorted=[...lines].sort((a,b)=>a.application<b.application?-1:a.application>b.application?1:0),total=sorted.reduce((n,l)=>n+BigInt(l.amountMinor),0n);
 if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new BadRequestError('Bundle exceeds supported money range');
 const discount=total*BigInt(bps)/10000n,parts=sorted.map(l=>({...l,off:BigInt(l.amountMinor)*BigInt(bps)/10000n,remainder:BigInt(l.amountMinor)*BigInt(bps)%10000n}));
 let remaining=discount-parts.reduce((n,l)=>n+l.off,0n);
 for(const p of [...parts].sort((a,b)=>a.remainder===b.remainder?(a.application<b.application?-1:a.application>b.application?1:0):a.remainder>b.remainder?-1:1)){if(remaining===0n)break;p.off++;remaining--;}
 return {subtotalMinor:total.toString(),discountMinor:discount.toString(),amountMinor:(total-discount).toString(),lines:parts.map(p=>{const paid=BigInt(p.amountMinor)-p.off;if(paid<1n)throw new ConflictError('Discount leaves an unsupported zero-price line');return {application:p.application,listAmountMinor:p.amountMinor,discountMinor:p.off.toString(),amountMinor:paid.toString()};})};
}
export async function action(client:DatabaseClient,actor:string,key:string,input:unknown){
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(actor)||!/^[a-f0-9-]{36}$/.test(key))throw new BadRequestError('Invalid action identity');const hash=requestHash(input);
 await client.query('insert into pricing_actions(actor_id,idempotency_key,request_hash,response) values($1,$2,$3,NULL) on duplicate key update actor_id=actor_id',[actor,key,hash]);
 const row=(await client.query<{request_hash:string;response:string|Record<string,unknown>|null}>('select request_hash,response from pricing_actions where actor_id=$1 and idempotency_key=$2 for update',[actor,key])).rows[0]!;
 if(row.request_hash!==hash)throw new ConflictError('Action key belongs to another request');return row.response?decode(row.response):null;
}
export async function finish(client:DatabaseClient,actor:string,key:string,response:unknown){await client.query('update pricing_actions set response=$1 where actor_id=$2 and idempotency_key=$3',[response,actor,key]);}
export class BundleRules {
 constructor(private db:Database,private now=Date.now){}
 async history(scopes:readonly string[]){
  const rows=await this.db.query<{id:string;rule_key:string;revision:number;published_version_id:string|null;payload:string|BundleRule;created_by:string}>('select v.id,v.rule_key,v.revision,h.published_version_id,v.payload,v.created_by from bundle_rule_versions v join bundle_rules h on h.rule_key=v.rule_key where v.revision=h.revision or v.id=h.published_version_id order by v.created_at desc,v.id limit 2048');
  return rows.rows.map(r=>({...r,revision:Number(r.revision),payload:decode(r.payload)})).filter(r=>r.payload.applications.every(a=>scopes.includes(a)));
 }
 async save(actor:string,key:string,input:BundleRule,expectedRevision:number,scopes:readonly string[]){
  const rule=validateRule(input,this.now());const ruleKey=bundleKey(selection(rule.applications,rule.intervalMonths));
  if(!rule.applications.every(a=>scopes.includes(a)))throw new ForbiddenError('Every bundle app must be in staff scope');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new BadRequestError('Invalid revision');
  return this.db.withTransaction(async c=>{
   const replay=await action(c,actor,key,{kind:'bundle-draft',rule,expectedRevision});if(replay)return replay;
   await c.query('insert into bundle_rules(rule_key) values($1) on duplicate key update rule_key=rule_key',[ruleKey]);
   const head=(await c.query<{revision:number}>('select revision from bundle_rules where rule_key=$1 for update',[ruleKey])).rows[0]!;
   if(Number(head.revision)!==expectedRevision)throw new ConflictError('Bundle history changed; refresh before saving');
   const prior=(await c.query<{id:string;payload:string|BundleRule}>('select id,payload from bundle_rule_versions where rule_key=$1 and revision=$2',[ruleKey,Number(head.revision)])).rows[0];
   const revision=Number(head.revision)+1,versionId=randomUUID();
   await c.query('insert into bundle_rule_versions(id,rule_key,revision,payload,created_by) values($1,$2,$3,$4,$5)',[versionId,ruleKey,revision,rule,actor]);
   await c.query('update bundle_rules set revision=$1 where rule_key=$2',[revision,ruleKey]);
   await c.query('insert into staff_audit_events(event_id,occurred_at,actor_id,action,target_id,reason,details) values($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),this.now(),actor,'bundles.draft_saved',ruleKey,rule.evidenceNote,{before:prior?{...decode(prior.payload),versionId:prior.id}:null,after:{...rule,versionId,revision}}]);
   const response={ruleKey,versionId,revision,published:false};await finish(c,actor,key,response);return response;
  });
 }
 async publish(actor:string,key:string,versionId:string,expectedId:string|null,note:string,scopes:readonly string[]){
  if(!/^[a-f0-9-]{36}$/.test(versionId)||expectedId!==null&&!/^[a-f0-9-]{36}$/.test(expectedId)||typeof note!=='string'||note.trim().length<5||note.length>1000)throw new BadRequestError('Review and confirm bundle publication');
  return this.db.withTransaction(async c=>{
   const replay=await action(c,actor,key,{kind:'bundle-publish',versionId,expectedId,note});if(replay)return replay;
   const version=(await c.query<{rule_key:string;payload:string|BundleRule}>('select rule_key,payload from bundle_rule_versions where id=$1',[versionId])).rows[0];if(!version)throw new BadRequestError('Bundle draft unavailable');
   const rule=validateRule(decode(version.payload),this.now());if(!rule.applications.every(a=>scopes.includes(a)))throw new ForbiddenError('Every bundle app must be in staff scope');
   const head=(await c.query<{published_version_id:string|null}>('select published_version_id from bundle_rules where rule_key=$1 for update',[version.rule_key])).rows[0]!;
   if(head.published_version_id!==expectedId)throw new ConflictError('Published bundle changed; review current version');
   const prior=head.published_version_id?(await c.query<{payload:string|BundleRule}>('select payload from bundle_rule_versions where id=$1',[head.published_version_id])).rows[0]:null;
   await c.query('update bundle_rules set published_version_id=$1 where rule_key=$2',[versionId,version.rule_key]);
   await c.query('insert into staff_audit_events(event_id,occurred_at,actor_id,action,target_id,reason,details) values($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),this.now(),actor,rule.available?'bundles.published':'bundles.withdrawn',version.rule_key,note,{before:prior?{...decode(prior.payload),versionId:expectedId}:null,after:{...rule,versionId}}]);
   const response={versionId,published:true};await finish(c,actor,key,response);return response;
  });
 }
}

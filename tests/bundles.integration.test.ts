import {BundleRules,type BundleRule} from '../src/pricing/bundle-rules.js';
import {BundleService,VerifiedBundleSettlementWriter} from '../src/pricing/bundle-service.js';
import {listAudit} from '../src/back-office/audit-trail.js';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import mysql,{type Connection} from 'mysql2/promise';
import {createDatabase,type Database} from '../src/db/pool.js';import {loadEnv} from '../src/config/env.js';
import {buildPrivateApp,type ServiceCredential} from '../src/private-api.js';
import {companyApplications,COMPANY_ISSUER} from '../src/company/registry.js';
import {PricingCatalog,type DraftPrice} from '../src/pricing/catalog.js';
import {SubscriptionCatalog} from '../src/pricing/subscription-catalog.js';
import {planDefinition,type SubscriptionTerms,type IntervalMonths} from '../src/pricing/subscription-terms.js';
import {CommercialService,VerifiedSettlementWriter,type VerifiedSettlement,type QuoteSnapshot} from '../src/pricing/commercial-service.js';
import {closeCustomer} from '../src/customer/close-customer.js';
import {scenario} from './pricing-fixtures.js';
const require=createRequire(import.meta.url);const{registerCompanyApplications}=require('../scripts/register-company-apps.cjs') as {registerCompanyApplications:(connection:Connection)=>Promise<unknown>};
const env=loadEnv();if(!/(?:^|_)tests?(?:_|$)/.test(env.mysql.database))throw new Error('Disposable test database required');
const db=createDatabase(env);let connection:Connection,now=Date.now();
const credentials:ServiceCredential[]=companyApplications.map((r,i)=>({token:String(i+1).repeat(43),application:r.application,issuer:COMPANY_ISSUER,identityMode:'company',onboarding:'self_service',permissions:['catalog','provision','balance','unlink','commercial','bundles']}));
const owner={id:'company-owner',token:'o'.repeat(43),applications:companyApplications.map(r=>r.application),pricingPermissions:['read','write','publish'] as ('read'|'write'|'publish')[]};
const terms=(months:IntervalMonths=1,days=30,available=true):SubscriptionTerms=>({schemaVersion:2,model:'subscription',intervalMonths:months,available,trial:{enabled:days>0,days},renewal:'manual'});
const subs=()=>new SubscriptionCatalog(db,()=>now),service=()=>new CommercialService(db,()=>now);
async function reset(){const[rows]=await connection.query<mysql.RowDataPacket[]>("select table_name from information_schema.tables where table_schema=database() and table_type='BASE TABLE' and table_name<>'schema_migrations'");await connection.query('set foreign_key_checks=0');try{for(const row of rows){const name=String(row.TABLE_NAME??row.table_name);if(!/^[a-z0-9_]+$/i.test(name))throw new Error('Unexpected table');await connection.query('delete from `'+name+'`');}}finally{await connection.query('set foreign_key_checks=1');}}
beforeAll(async()=>{connection=await mysql.createConnection(env.mysql)});beforeEach(async()=>{await reset();await registerCompanyApplications(connection);now=Date.now()});afterAll(async()=>{await reset();await connection.end();await db.close()});
async function draft(index=0,months:IntervalMonths=1,price='79.00',days=30,available=true){
 const base=companyApplications[index]!.priceProductCode,plan=planDefinition(base,months),catalog=new PricingCatalog(db,()=>now),history=await catalog.history(plan.planCode);
 const input:DraftPrice={productCode:base,label:'Explicit subscription fixture',billingType:'subscription',unit:plan.unit,price,expectedRevision:history.revision,scenario:scenario({retailPrice:price}),validUntil:now+86400000,evidenceNote:'Synthetic exact fixture costs; no live business decision',terms:terms(months,days,available)};
 const saved=await subs().createDraft(owner.id,randomUUID(),input);return {base,months,id:String(saved.priceVersionId),previous:history.publishedPriceId};
}
async function publish(index=0,months:IntervalMonths=1,price='79.00',days=30,available=true){const d=await draft(index,months,price,days,available);await subs().publish(owner.id,randomUUID(),d.base,months,d.id,d.previous,'Explicit fixture publication');return d;}
async function customer(){const app=await buildPrivateApp(db,credentials),subject=randomUUID();try{for(const c of credentials)expect((await app.inject({method:'POST',url:'/v1/customer',headers:{authorization:'Bearer '+c.token},payload:{subject,action:'provision'}})).statusCode).toBe(200)}finally{await app.close()}return(index=0)=>({application:credentials[index]!.application,issuer:COMPANY_ISSUER,subject});}
const writer=()=>new VerifiedSettlementWriter(db,input=>Promise.resolve(input as VerifiedSettlement)); // Explicit test proof; no merchant.
function payment(q:QuoteSnapshot,overrides:Partial<VerifiedSettlement>={}):VerifiedSettlement{return{provider:'verified-fixture',eventId:randomUUID(),paymentId:randomUUID(),quoteId:q.quoteId,state:'paid',amountMinor:q.amountMinor,currency:'CNY',paidAt:now,periodStart:q.periodStart??null,periodEnd:q.periodEnd??null,...overrides};}
async function withdraw(d:Awaited<ReturnType<typeof publish>>){const history=await new PricingCatalog(db).history(planDefinition(d.base,d.months).planCode),saved=await subs().withdrawalDraft(owner.id,randomUUID(),d.base,d.months,d.id,history.revision);await subs().publish(owner.id,randomUUID(),d.base,d.months,String(saved.priceVersionId),d.id,'Stop new sales while preserving paid users');return String(saved.priceVersionId);}

const bundle=()=>new BundleService(db,()=>now),rules=()=>new BundleRules(db,()=>now),scopes=companyApplications.map(a=>a.application);
const selected=(apps=[scopes[0]!,scopes[1]!],months=1)=>({applications:apps,intervalMonths:months});
const rule=(extra:Partial<BundleRule>={}):BundleRule=>({...selected(),intervalMonths:1,discountBps:1000,available:true,label:'Explicit bundle fixture',evidenceNote:'Synthetic existing-cost review only; no real price decision',validUntil:now+7200000,...extra});
async function publishRule(input=rule()){
 const history=(await rules().history(scopes)).filter(v=>JSON.stringify(v.payload.applications)===JSON.stringify([...input.applications].sort())&&v.payload.intervalMonths===input.intervalMonths),revision=Math.max(0,...history.map(v=>v.revision)),previous=history[0]?.published_version_id??null;
 const saved=await rules().save(owner.id,randomUUID(),input,revision,scopes);await rules().publish(owner.id,randomUUID(),String(saved.versionId),previous,'Explicit fixture discount confirmation',scopes);return saved;
}
async function setup(){for(let i=0;i<3;i++)for(const m of [1,3,12,24] as const)await publish(i,m,'100.00',0);return await customer();}
function bundlePayment(q:Record<string,unknown>,overrides:Partial<VerifiedSettlement>={}):VerifiedSettlement{return {provider:'bundle-fixture',eventId:randomUUID(),paymentId:randomUUID(),quoteId:String(q.quoteId),state:'paid',amountMinor:String(q.amountMinor),currency:'CNY',paidAt:now,periodStart:Number(q.periodStart),periodEnd:Number(q.periodEnd),...overrides};}
const bundleWriter=()=>new VerifiedBundleSettlementWriter(db,e=>Promise.resolve(e as VerifiedSettlement));
it('keeps drafts private, publishes an exact combination/period, detects concurrent edits and logs named owners',async()=>{
 await setup();const input=rule(),saved=await rules().save(owner.id,randomUUID(),input,0,scopes);
 expect((await bundle().preview(selected())).discountBps).toBe(0);
 await expect(rules().save(owner.id,randomUUID(),input,0,scopes)).rejects.toThrow(/history changed/);
 await rules().publish(owner.id,randomUUID(),String(saved.versionId),null,'Owner approved exact fixture',scopes);
 expect((await bundle().preview(selected())).amountMinor).toBe('18000');expect((await bundle().preview(selected([scopes[1]!,scopes[0]!]))).amountMinor).toBe('18000');
 expect((await bundle().preview(selected(scopes))).discountBps).toBe(0);expect((await bundle().preview(selected(undefined,12))).discountBps).toBe(0);
 await expect(rules().publish(owner.id,randomUUID(),String(saved.versionId),null,'Stale publication fixture',scopes)).rejects.toThrow(/changed/);
 await expect(rules().save(owner.id,randomUUID(),rule(),1,[scopes[0]!])).rejects.toThrow(/scope/);
 const audit=await listAudit(db,scopes,1,100);expect(audit.rows.some(e=>e.actorId===owner.id&&e.action==='bundles.draft_saved')).toBe(true);expect(audit.rows.some(e=>e.actorId===owner.id&&e.action==='bundles.published')).toBe(true);
});
it('atomically grants selected apps using existing access and contracts, preserves others and refunds the whole bundle',async()=>{
 const who=await setup();await publishRule();const preview=await bundle().preview(selected()),key=randomUUID(),q=await bundle().quote(who(),selected(),preview.fingerprint,key);
 expect(await bundle().quote(who(),selected(),preview.fingerprint,key)).toEqual(q);expect((await service().access(who(),'current')).entitled).toBe(false);
 const w=bundleWriter(),proof=bundlePayment(q);await w.apply(proof);expect(await w.apply(proof)).toEqual(await w.apply(proof));
 expect((await service().access(who(),'current')).basis).toBe('paid');expect((await service().access(who(1),'current')).basis).toBe('paid');expect((await service().access(who(2),'current')).entitled).toBe(false);
 const records=(await db.query<{amount_minor:string;application:string;interval_months:number}>('select cast(amount_minor as char) amount_minor,application,interval_months from commercial_subscription_terms order by application')).rows;expect(records).toHaveLength(2);expect(records.reduce((n,r)=>n+BigInt(r.amount_minor),0n)).toBe(18000n);
 const other=await publish(2,1,'100.00',0),otherQuote=await service().quote(who(2),'current',other.id,randomUUID());await writer().apply(payment(otherQuote));
 await publishRule(rule({discountBps:2000,available:false}));await publish(0,1,'129.00',0);expect((await service().access(who(),'future')).entitled).toBe(true);
 await w.apply({...proof,eventId:randomUUID(),state:'refunded'});await w.apply(proof);expect((await service().access(who(),'current')).entitled).toBe(false);expect((await service().access(who(1),'current')).entitled).toBe(false);
 await w.apply({...proof,eventId:randomUUID()});expect((await service().access(who(),'current')).entitled).toBe(false);
 expect((await service().access(who(2),'current')).basis).toBe('paid');
 const withdrawal=(await listAudit(db,scopes,1,100)).rows.find(e=>e.action==='bundles.withdrawn')!;expect((withdrawal.beforeDetails as {discountBps:number}).discountBps).toBe(1000);expect((withdrawal.afterDetails as {available:boolean}).available).toBe(false);
});
it('refuses forged prices, stale reviews, single-line settlement and unequal existing renewal dates',async()=>{
 const who=await setup();await publishRule();const p=await bundle().preview(selected());await publishRule(rule({discountBps:1200}));await expect(bundle().quote(who(),selected(),p.fingerprint,randomUUID())).rejects.toThrow(/changed/);
 const fresh=await bundle().preview(selected()),q=await bundle().quote(who(),selected(),fresh.fingerprint,randomUUID()),proof=bundlePayment(q);
 await expect(bundleWriter().apply({...proof,amountMinor:'1'})).rejects.toThrow(/match/);await expect(bundleWriter().apply({...proof,periodEnd:proof.periodEnd!+1})).rejects.toThrow(/match/);
 const line=(q.lines as QuoteSnapshot[])[0]!;await expect(writer().apply(payment(line))).rejects.toThrow(/aggregate/);expect((await db.query('select id from commercial_grants')).rows).toHaveLength(0);
 const offer=await publish(0,3,'100.00',0),single=await service().quote(who(),'current',offer.id,randomUUID());await writer().apply(payment(single));
 await expect(bundle().quote(who(),selected(),fresh.fingerprint,randomUUID())).rejects.toThrow(/dates differ/);
});
it('rejects discounts below existing calculator costs and expired/withdrawn component plans',async()=>{
 const who=await setup();await publishRule(rule({discountBps:9900}));const p=await bundle().preview(selected());expect(p.eligibleForSale).toBe(false);await expect(bundle().quote(who(),selected(),p.fingerprint,randomUUID())).rejects.toThrow(/cost review/);
 await publishRule(rule({validUntil:now+1000}));now+=1001;expect((await bundle().preview(selected())).discountBps).toBe(0);
 const a=await publish(1);await withdraw(a);await expect(bundle().preview(selected())).rejects.toThrow(/unavailable/);
 await db.query("update applications set status='disabled' where code=$1",[scopes[2]]);await expect(bundle().preview(selected([scopes[0]!,scopes[2]!]))).rejects.toThrow(/registered/);
});
it('rolls back all line grants on a late failure, then retries; refund-before-paid cannot resurrect rights',async()=>{
 const who=await setup();const p=await bundle().preview(selected()),q=await bundle().quote(who(),selected(),p.fingerprint,randomUUID()),proof=bundlePayment(q),w=bundleWriter();
 const failing=(q.lines as QuoteSnapshot[])[1]!;
 const interrupted:Database={...db,withTransaction:fn=>db.withTransaction(c=>fn({query:(sql,values)=>{if(sql.startsWith('insert into commercial_subscription_terms')&&values?.[1]===failing.application)throw Error('fixture late failure');return c.query(sql,values)}}))};
 await expect(new VerifiedBundleSettlementWriter(interrupted,e=>Promise.resolve(e as VerifiedSettlement)).apply(proof)).rejects.toThrow(/fixture/);
 expect((await db.query('select id from commercial_grants')).rows).toHaveLength(0);expect((await db.query('select * from bundle_payments')).rows).toHaveLength(0);

 await w.apply({...proof,eventId:randomUUID(),state:'refunded'});await w.apply(proof);expect((await service().access(who(),'current')).entitled).toBe(false);
});
it('serializes simultaneous bundle and single purchases, preserves aligned renewal and company closure obligations',async()=>{
 const who=await setup(),p=await bundle().preview(selected()),a=await bundle().quote(who(),selected(),p.fingerprint,randomUUID()),b=await bundle().quote(who(),selected(),p.fingerprint,randomUUID());
 const results=await Promise.allSettled([bundleWriter().apply(bundlePayment(a)),bundleWriter().apply(bundlePayment(b))]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect((await db.query('select * from commercial_subscription_terms')).rows).toHaveLength(2);await expect(closeCustomer(db,COMPANY_ISSUER,who().subject,true)).rejects.toThrow(/paid subscription/);
 now+=1000;const next=await bundle().quote(who(),selected(),p.fingerprint,randomUUID());expect(next.periodStart).toBe(a.periodEnd);await bundleWriter().apply(bundlePayment(next));
 expect((await db.query('select * from commercial_subscription_terms')).rows).toHaveLength(4);
});
it('enforces private capability, staff scopes, origin and action shape through actual HTTP routes',async()=>{
 await setup();const app=await buildPrivateApp(db,credentials,[],[owner]);
 try{
 const header={authorization:'Bearer '+credentials[0]!.token};expect((await app.inject({method:'POST',url:'/v1/bundles',headers:header,payload:{action:'preview',...selected(),discountBps:9999}})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url:'/v1/bundles',payload:{action:'catalog'}})).statusCode).toBe(401);
 expect((await app.inject({method:'POST',url:'/v1/bundles',headers:header,payload:{action:'catalog'}})).json<{applications:unknown[]}>().applications).toHaveLength(3);
 const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://127.0.0.1:3100'},payload:{username:owner.id,password:owner.token}});const cookie=login.cookies.map(c=>c.name+'='+c.value).join('; ');
 const path='/api/v1/platform/pricing/bundles/versions',payload={rule:rule(),expectedRevision:0,idempotencyKey:randomUUID()};
 expect((await app.inject({method:'POST',url:path,headers:{cookie,origin:'https://foreign.example'},payload})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:path,headers:{cookie,origin:'http://127.0.0.1:3100'},payload})).statusCode).toBe(200);
 const old=await buildPrivateApp(db,[{...credentials[0]!,permissions:['catalog','commercial']}]);try{expect((await old.inject({method:'POST',url:'/v1/bundles',headers:header,payload:{action:'catalog'}})).statusCode).toBe(403)}finally{await old.close()}
 }finally{await app.close()}
});
it('adds a fourth registered product without introducing combination-specific pricing or grant code',async()=>{
 const who=await setup();const future={...companyApplications[0]!,application:'future-app',name:'Fourth app fixture',productKey:'future',accessKey:'future-access',basePath:'/future/',priceProductCode:'future-app:access'};
 companyApplications.push(future);
 try{
  await db.query("insert into applications(code,name,status) values($1,$2,'active')",[future.application,future.name]);
  await db.query('insert into company_application_products(application_code,issuer,product_key,catalog_id,access_key,base_path,price_product_code) values($1,$2,$3,$4,$5,$6,$7)',[future.application,COMPANY_ISSUER,future.productKey,future.catalogId,future.accessKey,future.basePath,future.priceProductCode]);
  await publish(3,12,'200.00',0);
  const choice=selected([scopes[1]!,future.application],12),expanded=[...scopes,future.application];const saved=await rules().save(owner.id,randomUUID(),rule({...choice,intervalMonths:12,discountBps:1500}),0,expanded);await rules().publish(owner.id,randomUUID(),String(saved.versionId),null,'Fourth-product fixture review',expanded);
  const preview=await bundle().preview(choice);expect(preview.amountMinor).toBe('25500');
  const quote=await bundle().quote(who(),choice,preview.fingerprint,randomUUID());await bundleWriter().apply(bundlePayment(quote));
  const rows=await db.query<{application:string}>('select application from commercial_subscription_terms order by application');expect(rows.rows.map(r=>r.application)).toEqual(['atlas-simulation','future-app']);
  expect((await bundle().catalog()).applications.map(a=>a.application)).toContain(future.application);
 }finally{companyApplications.pop()}
});

it('bounds outstanding quotes per company identity while permitting exact retries',async()=>{
 const who=await setup(),p=await bundle().preview(selected()),key=randomUUID(),first=await bundle().quote(who(),selected(),p.fingerprint,key);
 for(let i=1;i<20;i++)await bundle().quote(who(),selected(),p.fingerprint,randomUUID());
 await expect(bundle().quote(who(),selected(),p.fingerprint,randomUUID())).rejects.toThrow(/Too many/);
 expect(await bundle().quote(who(),selected(),p.fingerprint,key)).toEqual(first);
 expect((await db.query('select count(*) n from bundle_quotes')).rows[0]!.n).toBe(20);
});

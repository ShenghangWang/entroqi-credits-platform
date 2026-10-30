import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import mysql,{type Connection} from 'mysql2/promise';
import {createDatabase} from '../src/db/pool.js';import {loadEnv} from '../src/config/env.js';
import {buildPrivateApp,type ServiceCredential} from '../src/private-api.js';
import {companyApplications,COMPANY_ISSUER} from '../src/company/registry.js';
import {PricingCatalog,type DraftPrice} from '../src/pricing/catalog.js';
import {SubscriptionCatalog} from '../src/pricing/subscription-catalog.js';
import {subscriptionPeriods,planDefinition,type SubscriptionTerms,type IntervalMonths} from '../src/pricing/subscription-terms.js';
import {CommercialService,VerifiedSettlementWriter,type VerifiedSettlement,type QuoteSnapshot} from '../src/pricing/commercial-service.js';
import {BackOfficeData} from '../src/back-office/data.js';import {closeCustomer} from '../src/customer/close-customer.js';
import {scenario} from './pricing-fixtures.js';
const require=createRequire(import.meta.url);const{registerCompanyApplications}=require('../scripts/register-company-apps.cjs') as {registerCompanyApplications:(connection:Connection)=>Promise<unknown>};
const env=loadEnv();if(!/(?:^|_)tests?(?:_|$)/.test(env.mysql.database))throw new Error('Disposable test database required');
const db=createDatabase(env);let connection:Connection,now=Date.now();
const credentials:ServiceCredential[]=companyApplications.map((r,i)=>({token:String(i+1).repeat(43),application:r.application,issuer:COMPANY_ISSUER,identityMode:'company',onboarding:'self_service',permissions:['catalog','provision','balance','unlink','commercial']}));
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

it('publishes all four independently priced periods for every app without publishing a draft or exposing lifetime/cost data',async()=>{
 for(let i=0;i<3;i++){
  const base=companyApplications[i]!.priceProductCode;
  expect((await subs().offers(base)).plans).toHaveLength(0);
  const pending=await draft(i,24,'199.00');expect((await subs().offers(base)).plans).toHaveLength(0);
  await subs().publish(owner.id,randomUUID(),base,24,pending.id,null,'Reviewed two-year fixture');
  for(const[m,p]of [[1,'19.00'],[3,'49.00'],[12,'129.00']] as const)await publish(i,m,p,0);
  const offers=await subs().offers(base);expect(offers.plans.map(p=>p.terms.intervalMonths)).toEqual([1,3,12,24]);expect(offers.plans.map(p=>p.amountMinor)).toEqual(['1900','4900','12900','19900']);expect(JSON.stringify(offers)).not.toMatch(/licensedVersion|version_license|evidenceNote|scenario/);
 }
},20000);
it('stores each customer/app/interval/price/date as an independent relational contract and expires at its exact end',async()=>{
 for(let i=0;i<3;i++)for(const p of subscriptionPeriods){
  const offer=await publish(i,p.months),who=(await customer())(i),q=await service().quote(who,'current',offer.id,randomUUID());
  const result=await writer().apply(payment(q));expect(result.status).toBe('active');
  const row=(await db.query('select application,issuer,subject,interval_months,amount_minor,currency,period_start,period_end,price_version_id from commercial_subscription_terms where grant_id=$1',[result.grantId])).rows[0]!;
  expect(row).toMatchObject({application:who.application,issuer:who.issuer,subject:who.subject,interval_months:p.months,amount_minor:'7900',currency:'CNY',price_version_id:offer.id});expect(Number(row.period_start)).toBe(q.periodStart);expect(Number(row.period_end)).toBe(q.periodEnd);
  expect((await service().access(who,'any-new-version')).basis).toBe('paid');
  for(const other of [0,1,2].filter(n=>n!==i))expect((await service().access({...who,application:credentials[other]!.application},'current')).entitled).toBe(false);
  const end=q.periodEnd!;expect((await new CommercialService(db,()=>end).access(who,'current')).entitled).toBe(false);
 }
 expect(Number((await db.query<{total:number}>('select count(*) total from commercial_subscription_terms')).rows[0]!.total)).toBe(12);
},20000);
it('queues early renewals without overlap and retains the January31 anchor through February and subsequent months',async()=>{
 now=Date.UTC(2028,0,31,12);const offer=await publish(),who=(await customer())(),q1=await service().quote(who,'current',offer.id,randomUUID());
 expect(q1.periodEnd).toBe(Date.UTC(2028,1,29,12));await writer().apply(payment(q1));
 now+=1000;const q2=await service().quote(who,'current',offer.id,randomUUID());expect(q2.periodStart).toBe(q1.periodEnd);expect(q2.periodEnd).toBe(Date.UTC(2028,2,31,12));await writer().apply(payment(q2));
 now=q1.periodEnd!;expect((await service().access(who,'future')).basis).toBe('paid');now=q2.periodEnd!;expect((await service().access(who,'future')).entitled).toBe(false);
});
it('withdraws one plan only after explicit publication, preserves paid dates/price and permits later re-enabling',async()=>{
 const annual=await publish(0,12,'129.00'),twoYear=await publish(0,24,'199.00'),who=(await customer())(),q=await service().quote(who,'current',twoYear.id,randomUUID());await writer().apply(payment(q));
 const h=await new PricingCatalog(db).history(planDefinition(twoYear.base,24).planCode),saved=await subs().withdrawalDraft(owner.id,randomUUID(),twoYear.base,24,twoYear.id,h.revision);
 expect((await subs().offers(twoYear.base)).plans.map(p=>p.terms.intervalMonths)).toEqual([12,24]);
 await subs().publish(owner.id,randomUUID(),twoYear.base,24,String(saved.priceVersionId),twoYear.id,'Owner confirmed removal of two-year sales');
 expect((await subs().offers(twoYear.base)).plans.map(p=>p.terms.intervalMonths)).toEqual([12]);expect((await service().access(who,'any')).basis).toBe('paid');
 await expect(service().quote(who,'current',twoYear.id,randomUUID())).rejects.toThrow(/changed|removed|withdrawn/);
 await publish(0,24,'249.00',0);expect((await subs().offers(twoYear.base)).plans.find(p=>p.terms.intervalMonths===24)!.amountMinor).toBe('24900');
 const original=(await db.query<{snapshot:string|QuoteSnapshot}>('select snapshot from commercial_quotes where id=$1',[q.quoteId])).rows[0]!.snapshot;expect(typeof original==='string'?(JSON.parse(original) as QuoteSnapshot).amountMinor:original.amountMinor).toBe('19900');
 expect((await subs().offers(annual.base)).plans.find(p=>p.terms.intervalMonths===12)!.amountMinor).toBe('12900');
});
it('allows withdrawing expired cost evidence without falsely renewing it or enabling a purchase',async()=>{
 const offer=await publish();now+=86400001;await withdraw(offer);expect((await subs().offers(offer.base)).plans).toHaveLength(0);
});
it('never resets a trial when changing periods/prices or leaving/rejoining an app; each app remains independent',async()=>{
 const who=await customer(),offers=await Promise.all([publish(0,1),publish(1,3,'79.00',7),publish(2,12,'129.00',14)]);
 const first=await service().startTrial(who(),'current',offers[0].id);const quarter=await publish(0,3,'49.00',90);
 expect((await service().startTrial(who(),'new-version',quarter.id)).expiresAt).toBe(first.expiresAt);
 await service().startTrial(who(1),'current',offers[1].id);expect((await service().access(who(2),'current')).entitled).toBe(false);
 const app=await buildPrivateApp(db,credentials);try{const headers={authorization:'Bearer '+credentials[0]!.token};await app.inject({method:'POST',url:'/v1/customer',headers,payload:{subject:who().subject,action:'unlink'}});await expect(service().access(who(),'current')).rejects.toThrow(/membership/);await app.inject({method:'POST',url:'/v1/customer',headers,payload:{subject:who().subject,action:'provision'}})}finally{await app.close()}
 expect((await service().startTrial(who(),'current',quarter.id)).expiresAt).toBe(first.expiresAt);now=first.expiresAt;expect((await service().access(who(),'current')).entitled).toBe(false);
});
it('rejects forged amounts, coverage, overlapping purchases and refund replays without granting extra access',async()=>{
 const offer=await publish(0,3),who=(await customer())(),a=await service().quote(who,'current',offer.id,randomUUID()),b=await service().quote(who,'current',offer.id,randomUUID()),proof=payment(a),w=writer();
 await expect(w.apply({...proof,amountMinor:'1'})).rejects.toThrow(/match/);await expect(w.apply({...proof,periodEnd:a.periodEnd!+1})).rejects.toThrow(/coverage/);
 await expect(new VerifiedSettlementWriter(db,()=>Promise.reject(new Error('Signature invalid'))).apply(proof)).rejects.toThrow(/Signature/);
 await w.apply(proof);await expect(w.apply(payment(b))).rejects.toThrow(/overlap/);
 await w.apply({...proof,state:'refunded',eventId:randomUUID()});await w.apply(proof);expect((await service().access(who,'current')).entitled).toBe(false);
 await expect(w.apply({...proof,amountMinor:'7901'})).rejects.toThrow(/replay changed/);
});
it('persists a refund received before its paid event and never resurrects that contract',async()=>{
 const offer=await publish(0,24),who=(await customer())(),q=await service().quote(who,'current',offer.id,randomUUID()),proof=payment(q),w=writer();
 await w.apply({...proof,state:'refunded',eventId:randomUUID()});await w.apply(proof);expect((await service().access(who,'current')).entitled).toBe(false);
 expect((await db.query('select status from commercial_grants')).rows).toEqual([{status:'refunded'}]);expect((await db.query('select interval_months from commercial_subscription_terms')).rows).toEqual([{interval_months:24}]);
});
it('protects published prices against stale managers and preserves accepted quotes across later price edits',async()=>{
 const first=await publish(),who=(await customer())(),key=randomUUID(),q=await service().quote(who,'current',first.id,key),next=await draft(0,1,'99.00');
 await subs().publish(owner.id,randomUUID(),next.base,1,next.id,first.id,'Confirmed future price99');
 const stale=await draft(0,1,'89.00');await expect(subs().publish(owner.id,randomUUID(),stale.base,1,stale.id,first.id,'Stale manager publication')).rejects.toThrow(/changed/);
 expect((await service().quote(who,'current',first.id,key)).quoteId).toBe(q.quoteId);await writer().apply(payment(q));expect((await service().access(who,'current')).basis).toBe('paid');
 await expect(service().quote(who,'current',first.id,randomUUID())).rejects.toThrow(/changed/);
});
it('retains historical paid version rights but rejects them as new sale quotes',async()=>{
 const who=(await customer())(),base=companyApplications[0]!.priceProductCode,catalog=new PricingCatalog(db,()=>now);
 const legacy=await catalog.createDraft(owner.id,randomUUID(),{productCode:base,label:'Historical immutable fixture',billingType:'one_time',unit:'legacy',price:'79.00',expectedRevision:0,scenario:scenario(),validUntil:now+86400000,evidenceNote:'Historical fixture, never a currently offered plan',terms:{schemaVersion:1,model:'version_license',licensedVersion:'v1',trial:{enabled:false,days:0},renewal:'manual'}});
 const quoteId=randomUUID(),snapshot={quoteId,...who,productCode:base,priceVersionId:String(legacy.priceVersionId),amountMinor:'7900',currency:'CNY',label:'Historic',terms:{schemaVersion:1,model:'version_license',licensedVersion:'v1',trial:{enabled:false,days:0},renewal:'manual'},requestedVersion:'v1',createdAt:now,expiresAt:now+900000,checkoutAvailable:false};
 await db.query('insert into commercial_quotes(id,application,issuer,subject,price_version_id,snapshot,expires_at) values($1,$2,$3,$4,$5,$6,$7)',[quoteId,who.application,who.issuer,who.subject,legacy.priceVersionId,snapshot,snapshot.expiresAt]);
 await db.query("insert into commercial_grants(id,quote_id,provider,payment_id,status,snapshot) values($1,$2,'historic-fixture',$3,'active',$4)",[randomUUID(),quoteId,randomUUID(),{...snapshot,grantId:randomUUID(),paidAt:now,periodStart:null,periodEnd:null}]);
 expect((await service().access(who,'v1')).basis).toBe('paid');expect((await service().access(who,'v2')).entitled).toBe(false);
 expect((await subs().offers(base)).plans).toHaveLength(0);await expect(service().quote(who,'v1',String(legacy.priceVersionId),randomUUID())).rejects.toThrow(/removed|changed/);
});
it('will not close a company account with paid subscription obligations and retains records after a refunded closure',async()=>{
 const offer=await publish(),who=(await customer())(),q=await service().quote(who,'current',offer.id,randomUUID()),proof=payment(q),w=writer();await w.apply(proof);
 await expect(closeCustomer(db,who.issuer,who.subject,true)).rejects.toThrow(/paid subscription/);
 await w.apply({...proof,state:'refunded',eventId:randomUUID()});expect(await closeCustomer(db,who.issuer,who.subject,true)).toEqual({closed:true});expect((await db.query('select count(*) total from commercial_subscription_terms')).rows[0]!.total).toBe(1);
});
it('connects actual owner save/confirm/withdraw to app offers, customer contract records and original charts',async()=>{
 const app=await buildPrivateApp(db,credentials,[],[owner]),origin='http://127.0.0.1:3100',base=companyApplications[0]!.priceProductCode;
 try{
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{username:owner.id,password:owner.token}}),headers={origin,cookie:String(login.headers['set-cookie']).split(';')[0]!};
  const payload={productCode:base,label:'Owner annual fixture',billingType:'subscription',unit:'year',price:'129.00',expectedRevision:0,scenario:scenario({retailPrice:'129.00'}),validUntil:now+86400000,evidenceNote:'Fixture owner explicitly reviewed12month service cost',terms:terms(12),idempotencyKey:randomUUID()};
  const saved=await app.inject({method:'POST',url:'/api/v1/platform/pricing/versions',headers,payload});expect(saved.statusCode).toBe(200);const id=saved.json<{data:{priceVersionId:string}}>().data.priceVersionId;
  const offers=()=>app.inject({url:'/v1/offers/'+base,headers:{authorization:'Bearer '+credentials[0]!.token}});
  expect((await offers()).json()).toMatchObject({schemaVersion:2,plans:[]});
  expect((await app.inject({method:'POST',url:'/api/v1/platform/pricing/products/'+base+'/publish',headers,payload:{intervalMonths:12,priceVersionId:id,expectedPublishedId:null,note:'Confirmed annual offer',idempotencyKey:randomUUID()}})).statusCode).toBe(200);
  expect((await offers()).json()).toMatchObject({plans:[{amountMinor:'12900',terms:{intervalMonths:12,model:'subscription'}}]});
  const who=(await customer())(),q=await service().quote(who,'current',id,randomUUID());await writer().apply(payment(q));
  const records=await app.inject({url:'/api/v1/platform/pricing/contracts?application=simulation&page=1&pageSize=20',headers});expect(records.statusCode).toBe(200);expect(records.json()).toMatchObject({data:{total:1,rows:[{subject:who.subject,intervalMonths:12,amountMinor:'12900',priceVersionId:id}]}});
  const chart=await new BackOfficeData(db).dashboard(owner);expect(chart.planDistribution).toHaveLength(1);expect(chart.planDistribution[0]).toMatchObject({applicationCode:'simulation',count:1});expect(chart.metrics.todayConfirmedProductSalesMinor).toBe('12900');
  const outside=await new BackOfficeData(db).dashboard({...owner,applications:['atlas-ai']});expect(outside.planDistribution).toHaveLength(0);
  const legacy=await app.inject({method:'POST',url:'/api/v1/platform/pricing/versions',headers,payload:{...payload,billingType:'one_time',terms:{schemaVersion:1,model:'version_license',licensedVersion:'v1',trial:{enabled:false,days:0},renewal:'manual'},idempotencyKey:randomUUID()}});expect(legacy.statusCode).toBe(400);
  expect((await app.inject({url:'/v1/offers/'+base,headers:{authorization:'Bearer '+credentials[1]!.token}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/v1/commercial',headers:{authorization:'Bearer '+credentials[0]!.token},payload:{subject:who.subject,action:'settle',version:'current',paid:true}})).statusCode).toBe(400);
 }finally{await app.close()}
});

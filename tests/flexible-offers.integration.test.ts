import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import mysql,{type Connection} from 'mysql2/promise';
import { createDatabase } from '../src/db/pool.js';
import { loadEnv } from '../src/config/env.js';
import { buildPrivateApp,type ServiceCredential } from '../src/private-api.js';
import { companyApplications,COMPANY_ISSUER } from '../src/company/registry.js';
import { BackOfficeData } from '../src/back-office/data.js';
import { PricingCatalog } from '../src/pricing/catalog.js';
import { CommercialService,VerifiedSettlementWriter,type VerifiedSettlement,type QuoteSnapshot } from '../src/pricing/commercial-service.js';
import type { OfferTerms } from '../src/pricing/offer-terms.js';
import { scenario } from './pricing-fixtures.js';
const require=createRequire(import.meta.url);
const {registerCompanyApplications}=require('../scripts/register-company-apps.cjs') as {registerCompanyApplications:(connection:Connection)=>Promise<unknown>};
const env=loadEnv();if(!/(?:^|_)tests?(?:_|$)/.test(env.mysql.database))throw new Error('Disposable test database required');
const db=createDatabase(env);let connection:Connection,now=Date.now();
const credentials:ServiceCredential[]=companyApplications.map((row,i)=>({token:String(i+1).repeat(43),application:row.application,issuer:COMPANY_ISSUER,identityMode:'company',onboarding:'self_service',permissions:['catalog','provision','balance','unlink','commercial']}));
const owner={id:'company-owner',token:'o'.repeat(43),applications:companyApplications.map(row=>row.application),pricingPermissions:['read','write','publish'] as ('read'|'write'|'publish')[]};
const terms=(model:OfferTerms['model']='version_license',days=30,version='v1'):OfferTerms=>({schemaVersion:1,model,licensedVersion:model==='version_license'?version:null,trial:{enabled:days>0,days},renewal:'manual'});
async function reset(){const[rows]=await connection.query<mysql.RowDataPacket[]>("select table_name from information_schema.tables where table_schema=database() and table_type='BASE TABLE' and table_name<>'schema_migrations'");await connection.query('set foreign_key_checks=0');try{for(const row of rows){const name=String(row.TABLE_NAME??row.table_name);if(!/^[a-z0-9_]+$/i.test(name))throw new Error('Unexpected table');await connection.query('delete from `'+name+'`');}}finally{await connection.query('set foreign_key_checks=1');}}
beforeAll(async()=>{connection=await mysql.createConnection(env.mysql);});
beforeEach(async()=>{await reset();await registerCompanyApplications(connection);now=Date.now();});
afterAll(async()=>{if(connection){await reset();await connection.end();}await db.close();});
async function publish(index=0,policy=terms(),price='79.00'){
  const catalog=new PricingCatalog(db,()=>now),productCode=companyApplications[index]!.priceProductCode;
  const history=await catalog.history(productCode);
  const created=await catalog.createDraft(owner.id,randomUUID(),{productCode,label:'Explicit test offer',billingType:policy.model==='monthly'?'monthly':'one_time',unit:policy.model==='monthly'?'month':'version license',price,expectedRevision:history.revision,scenario:scenario({retailPrice:price}),validUntil:now+86400000,evidenceNote:'Synthetic explicit fixture costs; no actual business decision',terms:policy});
  await catalog.publish(owner.id,randomUUID(),productCode,String(created.priceVersionId),history.publishedPriceId,'Test publication of new immutable terms');
  return catalog.offer(productCode);
}
async function customer(){
  const app=await buildPrivateApp(db,credentials,[],[owner]),subject=randomUUID();
  try{for(const credential of credentials)expect((await app.inject({method:'POST',url:'/v1/customer',headers:{authorization:'Bearer '+credential.token},payload:{subject,action:'provision'}})).statusCode).toBe(200);}finally{await app.close();}
  return (index=0)=>({application:credentials[index]!.application,issuer:COMPANY_ISSUER,subject});
}
function payment(quote:QuoteSnapshot,overrides:Partial<VerifiedSettlement>={}):VerifiedSettlement{return {provider:'verified-fixture',eventId:randomUUID(),paymentId:randomUUID(),quoteId:quote.quoteId,state:'paid',amountMinor:quote.amountMinor,currency:'CNY',paidAt:now,periodStart:quote.terms.model==='monthly'?now:null,periodEnd:quote.terms.model==='monthly'?now+30*86400000:null,...overrides};}
const writer=()=>new VerifiedSettlementWriter(db,(input)=>Promise.resolve(input as VerifiedSettlement)); // Explicit fixture port; no merchant contacted.

it('switches amount/model/trial settings while preserving old revisions, quote snapshots and already-started trials',async()=>{
  const first=await publish(),who=(await customer())(),service=new CommercialService(db,()=>now);
  const trials=await Promise.all(Array.from({length:8},()=>service.startTrial(who,'v1',first.priceVersionId)));
  expect(new Set(trials.map(row=>row.expiresAt)).size).toBe(1);
  const quoteKey=randomUUID(),quote=await service.quote(who,'v1',first.priceVersionId,quoteKey);
  const second=await publish(0,terms('monthly',0),'99.00');
  expect(second).toMatchObject({billingType:'monthly',amountMinor:'9900',terms:{model:'monthly',trial:{enabled:false,days:0}}});
  expect((await service.quote(who,'v1',first.priceVersionId,quoteKey)).priceVersionId).toBe(first.priceVersionId);
  expect((await service.startTrial(who,'v1',second.priceVersionId)).expiresAt).toBe(trials[0]!.expiresAt);
  expect((await service.access(who,'v1')).basis).toBe('trial');
  const old=(await new PricingCatalog(db).history(companyApplications[0]!.priceProductCode)).versions.find(row=>row.priceVersionId===first.priceVersionId)!;
  expect(old.terms).toEqual(terms());expect(quote.amountMinor).toBe('7900');
  const other=(await customer())();await expect(service.startTrial(other,'v1',second.priceVersionId)).rejects.toThrow(/no free trial/);
  await expect(service.quote(other,'v1',first.priceVersionId,randomUUID())).rejects.toThrow(/changed/);
  now=trials[0]!.expiresAt;expect((await service.access(who,'v1')).entitled).toBe(false);
});
it('keeps all three product trials independent and cannot restart one by publishing another price/version',async()=>{
  const offers=await Promise.all([publish(0),publish(1,terms('version_license',7),'19.00'),publish(2,terms('version_license',14),'29.00')]);
  const identity=await customer(),service=new CommercialService(db,()=>now);
  for(let i=0;i<3;i++){await service.startTrial(identity(i),'v1',offers[i]!.priceVersionId);expect((await service.access(identity(i),'v1')).basis).toBe('trial');}
  now+=8*86400000;expect((await service.access(identity(1),'v1')).entitled).toBe(false);expect((await service.access(identity(2),'v1')).entitled).toBe(true);
  const updated=await publish(1,terms('version_license',30,'v2'),'39.00');
  const restarted=await new CommercialService(db,()=>now).startTrial(identity(1),'v2',updated.priceVersionId);
  expect(restarted.version).toBe('v1');expect((await service.access(identity(1),'v2')).entitled).toBe(false);
});
it('requires active company membership and retains trial history across unlink/rejoin',async()=>{
  const offer=await publish(),who=(await customer())(),service=new CommercialService(db,()=>now);
  const started=await service.startTrial(who,'v1',offer.priceVersionId),app=await buildPrivateApp(db,credentials);
  try{
    const headers={authorization:'Bearer '+credentials[0]!.token};
    await app.inject({method:'POST',url:'/v1/customer',headers,payload:{subject:who.subject,action:'unlink'}});
    await expect(service.access(who,'v1')).rejects.toThrow(/membership/);
    await app.inject({method:'POST',url:'/v1/customer',headers,payload:{subject:who.subject,action:'provision'}});
    expect((await service.startTrial(who,'v1',offer.priceVersionId)).expiresAt).toBe(started.expiresAt);
  }finally{await app.close();}
});
it('enforces monthly expiry and exact-version lifetime rights independently of later offer switches',async()=>{
  const service=new CommercialService(db,()=>now),who=(await customer())();
  const once=await publish(0,terms('version_license',0),'79.00'),old=await service.quote(who,'v1',once.priceVersionId,randomUUID());
  await writer().apply(payment(old));
  const dashboard=await new BackOfficeData(db).dashboard(owner);
  expect(dashboard.planDistribution).toHaveLength(1);expect(dashboard.planDistribution[0]).toMatchObject({applicationCode:'simulation',count:1});expect(dashboard.metrics.todayConfirmedProductSalesMinor).toBe('7900');
  const foreign=await new BackOfficeData(db).dashboard({...owner,applications:['atlas-ai']});expect(foreign.planDistribution).toHaveLength(0);expect(foreign.metrics.todayConfirmedProductSalesMinor).toBe('0');
  const month=await publish(0,terms('monthly',0),'19.00'),monthly=await service.quote(who,'v2',month.priceVersionId,randomUUID());await writer().apply(payment(monthly));
  expect((await service.access(who,'v2')).basis).toBe('paid');
  now+=30*86400000;expect((await service.access(who,'v2')).entitled).toBe(false);expect((await service.access(who,'v1')).basis).toBe('paid');
});
it('verifies payment evidence via an explicit trusted port, rejects mismatches and cannot resurrect a refunded grant',async()=>{
  const offer=await publish(0,terms('version_license',0)),who=(await customer())(),service=new CommercialService(db,()=>now);
  const quote=await service.quote(who,'v1',offer.priceVersionId,randomUUID()),proof=payment(quote),settlement=writer();
  await expect(settlement.apply({...proof,amountMinor:'1'})).rejects.toThrow(/match/);
  await expect(new VerifiedSettlementWriter(db,()=>Promise.reject(new Error('Signature invalid'))).apply(proof)).rejects.toThrow(/Signature/);
  const refund={...proof,state:'refunded' as const,eventId:randomUUID()};await settlement.apply(refund);await settlement.apply(proof);
  expect((await service.access(who,'v1')).entitled).toBe(false);
  await expect(settlement.apply({...proof,amountMinor:'7901'})).rejects.toThrow(/replay changed/);
});
it('connects original staff-session publication to safe app-facing offer reads and rejects forged settlement privileges',async()=>{
  const app=await buildPrivateApp(db,credentials,[],[owner]),origin='http://127.0.0.1:3100',productCode=companyApplications[0]!.priceProductCode;
  try{
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{username:owner.id,password:owner.token}});
    const headers={origin,cookie:String(login.headers['set-cookie']).split(';')[0]!};
    const created=await app.inject({method:'POST',url:'/api/v1/platform/pricing/versions',headers,payload:{productCode,label:'Owner fixture monthly plan',billingType:'monthly',unit:'month',price:'49.00',expectedRevision:0,scenario:scenario({retailPrice:'49.00'}),validUntil:now+86400000,evidenceNote:'Fixture owner cost evidence and explicit rates',terms:terms('monthly',30),idempotencyKey:randomUUID()}});
    expect(created.statusCode).toBe(200);const id=created.json<{data:{priceVersionId:string}}>().data.priceVersionId;
    expect((await app.inject({method:'POST',url:'/api/v1/platform/pricing/products/'+productCode+'/publish',headers,payload:{priceVersionId:id,expectedPublishedId:null,note:'Owner reviewed fixture publication',idempotencyKey:randomUUID()}})).statusCode).toBe(200);
    const published=await app.inject({url:'/v1/offers/'+productCode,headers:{authorization:'Bearer '+credentials[0]!.token}});
    expect(published.json()).toMatchObject({amountMinor:'4900',terms:{model:'monthly',trial:{enabled:true,days:30}},commerceEnabled:false});
    expect(published.body).not.toMatch(/scenario|evidenceNote|supportHourlyCost/);
    const subject=randomUUID(),serviceHeaders={authorization:'Bearer '+credentials[0]!.token};
    expect((await app.inject({method:'POST',url:'/v1/customer',headers:serviceHeaders,payload:{subject,action:'provision'}})).statusCode).toBe(200);
    const start=()=>app.inject({method:'POST',url:'/v1/commercial',headers:serviceHeaders,payload:{subject,action:'trial',version:'v1',expectedPriceVersionId:id}});
    const firstTrial=await start(),repeatTrial=await start();expect(firstTrial.statusCode).toBe(200);expect(repeatTrial.json()).toMatchObject({expiresAt:firstTrial.json<{expiresAt:number}>().expiresAt,replayed:true});
    expect((await app.inject({method:'POST',url:'/v1/commercial',headers:serviceHeaders,payload:{subject,action:'status',version:'v1'}})).json()).toMatchObject({application:'simulation',entitled:true,basis:'trial'});
    expect((await app.inject({method:'POST',url:'/v1/commercial',headers:serviceHeaders,payload:{subject,action:'status',version:'v1',amountMinor:'1',paid:true}})).statusCode).toBe(400);
    const metadataApp=await buildPrivateApp(db,[{...credentials[0]!,token:'m'.repeat(43),permissions:['catalog']}]);
    try{expect((await metadataApp.inject({method:'POST',url:'/v1/commercial',headers:{authorization:'Bearer '+'m'.repeat(43)},payload:{subject,action:'status',version:'v1'}})).statusCode).toBe(403);}finally{await metadataApp.close();}

    expect((await app.inject({url:'/v1/offers/'+productCode,headers:{authorization:'Bearer '+credentials[1]!.token}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/v1/commercial',headers:{authorization:'Bearer '+credentials[0]!.token},payload:{subject:'fixture',action:'settle',version:'v1'}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/commercial/grants',payload:{role:'owner',paid:true}})).statusCode).toBe(404);
  }finally{await app.close();}
});

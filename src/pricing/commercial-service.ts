import { randomUUID } from 'node:crypto';
import type { Database, DatabaseClient } from '../db/pool.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors.js';
import { requestHash } from '../http/request-hash.js';
import { companyApplications, COMPANY_ISSUER } from '../company/registry.js';
import { PricingCatalog } from './catalog.js';
import type { OfferTerms } from './offer-terms.js';
import { calendarPeriodEnd,subscriptionPeriods,subscriptionPlan,planDefinition,validateSubscriptionTerms,type SubscriptionTerms } from './subscription-terms.js';
const json=<T>(value:string|T):T=>typeof value==='string'?JSON.parse(value) as T:value;
export interface CommercialPrincipal { application:string; issuer:string; subject:string }
export interface QuoteSnapshot extends Record<string,unknown> {
 quoteId:string; application:string; issuer:string; subject:string; productCode:string; priceVersionId:string;
 amountMinor:string; currency:'CNY'; label:string; terms:OfferTerms; requestedVersion:string;
 createdAt:number; expiresAt:number; checkoutAvailable:false;
 planCode?:string; periodStart?:number|null; periodEnd?:number|null; calendarAnchorDay?:number;
}
export interface TrialSnapshot extends Record<string,unknown>{application:string;priceVersionId:string;version:string;startedAt:number;expiresAt:number;terms:OfferTerms}
interface GrantSnapshot extends QuoteSnapshot {grantId:string;paidAt:number;periodStart:number|null;periodEnd:number|null}
function principal(value:CommercialPrincipal){if(value.issuer!==COMPANY_ISSUER||!companyApplications.some(r=>r.application===value.application)||!/^[A-Za-z0-9_-]{1,191}$/.test(value.subject))throw new ForbiddenError('Invalid company commercial identity');}
function version(value:string){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value))throw new BadRequestError('Invalid application context');}
async function active(client:DatabaseClient,who:CommercialPrincipal){
 principal(who);
 const row=await client.query(`select e.user_id from customer_external_identities e join users u on u.id=e.user_id join customer_application_memberships m on m.issuer=e.issuer and m.subject=e.subject where e.issuer=$1 and e.subject=$2 and m.application=$3 and m.status='active' and u.status='active' for update`,[who.issuer,who.subject,who.application]);
 if(!row.rows.length)throw new ForbiddenError('Active company customer membership required');
}
export class CommercialService {
 constructor(private db:Database,private now=Date.now){}
 private async current(client:DatabaseClient,who:CommercialPrincipal,expected:string){
  const base=companyApplications.find(r=>r.application===who.application)!.priceProductCode,codes=subscriptionPeriods.map(p=>planDefinition(base,p.months).planCode);
  const slots=codes.map((_,i)=>'$'+(i+1)).join(',');
  const head=(await client.query<{product_code:string}>(`select product_code from pricing_products where product_code in (${slots}) and published_price_id=$5 for update`,[...codes,expected])).rows[0];
  if(!head)throw new ConflictError('Offer changed or plan removed; review current subscriptions');
  const offer=await new PricingCatalog({...this.db,query:client.query.bind(client)},this.now).offer(head.product_code),terms=validateSubscriptionTerms(offer.terms);
  if(subscriptionPlan(head.product_code)?.months!==terms.intervalMonths)throw new ConflictError('Stored subscription period mismatch');
  if(!terms.available||!offer.eligibleForSale||offer.validUntil<=this.now())throw new ConflictError('Subscription is withdrawn or current cost review is not ready');
  return {...offer,terms,base};
 }
 async startTrial(who:CommercialPrincipal,requestedVersion:string,expectedPriceVersion:string){
  version(requestedVersion);
  return this.db.withTransaction(async client=>{
   await active(client,who);
   const existing=(await client.query<{snapshot:string|TrialSnapshot}>('select snapshot from commercial_trials where application=$1 and issuer=$2 and subject=$3 for update',[who.application,who.issuer,who.subject])).rows[0];
   if(existing)return {...json(existing.snapshot),replayed:true};
   const offer=await this.current(client,who,expectedPriceVersion);
   if(!offer.terms.trial.enabled)throw new ForbiddenError('This subscription has no free trial');
   const startedAt=this.now(),expiresAt=startedAt+offer.terms.trial.days*86400000;
   const snapshot:TrialSnapshot={application:who.application,priceVersionId:offer.priceVersionId,version:requestedVersion,startedAt,expiresAt,terms:offer.terms};
   await client.query('insert into commercial_trials(application,issuer,subject,price_version_id,started_at,expires_at,snapshot) values($1,$2,$3,$4,$5,$6,$7)',[who.application,who.issuer,who.subject,offer.priceVersionId,startedAt,expiresAt,snapshot]);return {...snapshot,replayed:false};
  });
 }
 async quote(who:CommercialPrincipal,requestedVersion:string,expectedPriceVersion:string,key:string){
  version(requestedVersion);if(!/^[a-f0-9-]{36}$/.test(key))throw new BadRequestError('Invalid quote request key');
  return this.db.withTransaction(async client=>{
   await active(client,who);
   const actor='quote-'+who.application,hash=requestHash({who,requestedVersion,expectedPriceVersion});
   await client.query('insert into pricing_actions(actor_id,idempotency_key,request_hash,response) values($1,$2,$3,NULL) on duplicate key update actor_id=actor_id',[actor,key,hash]);
   const previous=(await client.query<{request_hash:string;response:string|QuoteSnapshot|null}>('select request_hash,response from pricing_actions where actor_id=$1 and idempotency_key=$2 for update',[actor,key])).rows[0]!;
   if(previous.request_hash!==hash)throw new ConflictError('Quote key belongs to another request');if(previous.response)return json(previous.response);
   const offer=await this.current(client,who,expectedPriceVersion);
   // Paid renewals queue after purchased coverage, retaining its calendar anchor.
   const paid=(await client.query<{period_end:number;calendar_anchor_day:number}>(`select s.period_end,s.calendar_anchor_day from commercial_subscription_terms s join commercial_grants g on g.id=s.grant_id where s.application=$1 and s.issuer=$2 and s.subject=$3 and g.status='active' and s.period_end>$4 order by s.period_end desc limit 1`,[who.application,who.issuer,who.subject,this.now()])).rows[0];
   const legacy=(await client.query<{snapshot:string|GrantSnapshot}>(`select g.snapshot from commercial_grants g join commercial_quotes q on q.id=g.quote_id where q.application=$1 and q.issuer=$2 and q.subject=$3 and g.status='active' and JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='monthly' and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodEnd')) as unsigned)>$4 order by cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodEnd')) as unsigned) desc limit 1`,[who.application,who.issuer,who.subject,this.now()])).rows[0];
   const old=legacy?json(legacy.snapshot):null;
   const periodStart=Math.max(this.now(),Number(paid?.period_end??0),old?.periodEnd??0);
   const calendarAnchorDay=paid&&periodStart===Number(paid.period_end)?Number(paid.calendar_anchor_day):old&&periodStart===old.periodEnd?new Date(old.periodStart!).getUTCDate():new Date(periodStart).getUTCDate();
   const periodEnd=calendarPeriodEnd(periodStart,offer.terms.intervalMonths,calendarAnchorDay);
   const snapshot:QuoteSnapshot={quoteId:randomUUID(),...who,productCode:offer.base,planCode:offer.productCode,priceVersionId:offer.priceVersionId,amountMinor:offer.amountMinor,currency:'CNY',label:offer.label,terms:offer.terms,requestedVersion,createdAt:this.now(),expiresAt:Math.min(this.now()+900000,offer.validUntil),periodStart,periodEnd,calendarAnchorDay,checkoutAvailable:false};
   await client.query('insert into commercial_quotes(id,application,issuer,subject,price_version_id,snapshot,expires_at) values($1,$2,$3,$4,$5,$6,$7)',[snapshot.quoteId,who.application,who.issuer,who.subject,offer.priceVersionId,snapshot,snapshot.expiresAt]);
   await client.query('update pricing_actions set response=$1 where actor_id=$2 and idempotency_key=$3',[snapshot,actor,key]);return snapshot;
  });
 }
 async access(who:CommercialPrincipal,requestedVersion:string){
  version(requestedVersion);
  return this.db.withTransaction(async client=>{
   await active(client,who);const now=this.now();
   const trials=await client.query<{snapshot:string|TrialSnapshot}>('select snapshot from commercial_trials where application=$1 and issuer=$2 and subject=$3',[who.application,who.issuer,who.subject]);
   const current=(await client.query<{snapshot:string|GrantSnapshot}>(`select g.snapshot from commercial_subscription_terms s join commercial_grants g on g.id=s.grant_id where s.application=$1 and s.issuer=$2 and s.subject=$3 and g.status='active' and s.period_start<=$4 and $4<s.period_end order by s.period_end desc limit 1`,[who.application,who.issuer,who.subject,now])).rows[0];
   // Historical paid rights remain readable; no new version-license sale path.
   const historical=current?null:(await client.query<{snapshot:string|GrantSnapshot}>(`select g.snapshot from commercial_grants g join commercial_quotes q on q.id=g.quote_id where q.application=$1 and q.issuer=$2 and q.subject=$3 and g.status='active' and ((JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='version_license' and JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.licensedVersion'))=$4) or (JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='monthly' and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodStart')) as unsigned)<=$5 and $5<cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodEnd')) as unsigned))) order by g.created_at desc limit 1`,[who.application,who.issuer,who.subject,requestedVersion,now])).rows[0];
   const found=current??historical,grant=found?json(found.snapshot):null,trial=trials.rows[0]?json(trials.rows[0].snapshot):null;
   const trialActive=Boolean(trial&&(trial.terms.schemaVersion===2||trial.version===requestedVersion)&&trial.startedAt<=now&&now<trial.expiresAt);
   return {application:who.application,version:requestedVersion,entitled:Boolean(grant)||trialActive,basis:grant?'paid':trialActive?'trial':'none',grant:grant?{grantId:grant.grantId,priceVersionId:grant.priceVersionId,terms:grant.terms,periodStart:grant.periodStart,periodEnd:grant.periodEnd}:null,trial,checkoutAvailable:false as const};
  });
 }
}
export interface VerifiedSettlement {provider:string;eventId:string;paymentId:string;quoteId:string;state:'paid'|'refunded';amountMinor:string;currency:'CNY';paidAt:number;periodStart:number|null;periodEnd:number|null}
/** Trusted provider verification only; no public grant endpoint/default verifier. */
export class VerifiedSettlementWriter {
 constructor(private db:Database,private verify:(event:unknown)=>Promise<VerifiedSettlement>){}
 async apply(event:unknown){
  const proof=await this.verify(event);
  if(!proof||!/^[a-z0-9-]{1,40}$/.test(proof.provider)||![proof.eventId,proof.paymentId].every(id=>typeof id==='string'&&/^[A-Za-z0-9_:.-]{1,160}$/.test(id))||!/^[a-f0-9-]{36}$/.test(proof.quoteId)||!['paid','refunded'].includes(proof.state)||proof.currency!=='CNY'||!/^[1-9]\d{0,15}$/.test(proof.amountMinor)||!Number.isSafeInteger(proof.paidAt)||proof.paidAt<0)throw new BadRequestError('Invalid verified payment evidence');
  return this.db.withTransaction(async client=>{
   const hash=requestHash(proof);
   await client.query('insert into commercial_payment_events(provider,event_id,request_hash,response) values($1,$2,$3,NULL) on duplicate key update provider=provider',[proof.provider,proof.eventId,hash]);
   const previous=(await client.query<{request_hash:string;response:string|Record<string,unknown>|null}>('select request_hash,response from commercial_payment_events where provider=$1 and event_id=$2 for update',[proof.provider,proof.eventId])).rows[0]!;
   if(previous.request_hash!==hash)throw new ConflictError('Payment event replay changed');if(previous.response)return json(previous.response);
   const row=(await client.query<{snapshot:string|QuoteSnapshot}>('select snapshot from commercial_quotes where id=$1 for update',[proof.quoteId])).rows[0];if(!row)throw new NotFoundError('Payment quote unavailable');
   const quote=json(row.snapshot);
   await client.query('select issuer from customer_external_identities where issuer=$1 and subject=$2 for update',[quote.issuer,quote.subject]);
   if(quote.amountMinor!==proof.amountMinor||proof.paidAt<quote.createdAt||proof.paidAt>=quote.expiresAt)throw new ConflictError('Settlement does not match the accepted quote');
   const found=(await client.query<{id:string;quote_id:string;provider:string;payment_id:string;status:string}>('select id,quote_id,provider,payment_id,status from commercial_grants where quote_id=$1 or (provider=$2 and payment_id=$3) for update',[proof.quoteId,proof.provider,proof.paymentId])).rows;
   if(found.some(g=>g.quote_id!==proof.quoteId||g.provider!==proof.provider||g.payment_id!==proof.paymentId))throw new ConflictError('Payment identity belongs to another purchase');
   const current=found[0];
   if(quote.terms.schemaVersion!==2){if(!current||proof.state!=='refunded')throw new ForbiddenError('Lifetime and historical offers are closed to new settlement');}
   else {
    const terms=validateSubscriptionTerms(quote.terms);
    if(!Number.isSafeInteger(quote.periodStart)||!Number.isSafeInteger(quote.periodEnd)||proof.periodStart!==quote.periodStart||proof.periodEnd!==quote.periodEnd||calendarPeriodEnd(quote.periodStart!,terms.intervalMonths,quote.calendarAnchorDay)!==quote.periodEnd)throw new BadRequestError('Payment coverage must match the accepted calendar period');
    if(!current&&proof.state==='paid'){
     const overlap=await client.query(`select s.grant_id from commercial_subscription_terms s join commercial_grants g on g.id=s.grant_id where s.application=$1 and s.issuer=$2 and s.subject=$3 and g.status='active' and s.period_start<$4 and $5<s.period_end limit 1`,[quote.application,quote.issuer,quote.subject,quote.periodEnd,quote.periodStart]);
     if(overlap.rows.length)throw new ConflictError('Purchased coverage overlaps; reconciliation required');
    }
   }
   const grantId=current?.id??randomUUID(),status=current?.status==='refunded'||proof.state==='refunded'?'refunded':'active';
   const snapshot:GrantSnapshot={...quote,grantId,paidAt:proof.paidAt,periodStart:proof.periodStart,periodEnd:proof.periodEnd};
   if(current)await client.query('update commercial_grants set status=$1 where id=$2',[status,grantId]);
   else {
    await client.query('insert into commercial_grants(id,quote_id,provider,payment_id,status,snapshot) values($1,$2,$3,$4,$5,$6)',[grantId,proof.quoteId,proof.provider,proof.paymentId,status,snapshot]);
    const terms=quote.terms as SubscriptionTerms;
    await client.query('insert into commercial_subscription_terms(grant_id,application,issuer,subject,price_version_id,interval_months,amount_minor,currency,period_start,period_end,calendar_anchor_day) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[grantId,quote.application,quote.issuer,quote.subject,quote.priceVersionId,terms.intervalMonths,quote.amountMinor,'CNY',quote.periodStart,quote.periodEnd,quote.calendarAnchorDay]);
   }
   const response={grantId,status,quoteId:quote.quoteId};await client.query('update commercial_payment_events set response=$1 where provider=$2 and event_id=$3',[response,proof.provider,proof.eventId]);return response;
  });
 }
}

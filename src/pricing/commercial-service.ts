import { randomUUID } from 'node:crypto';
import type { Database, DatabaseClient } from '../db/pool.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors.js';
import { requestHash } from '../http/request-hash.js';
import { companyApplications, COMPANY_ISSUER } from '../company/registry.js';
import { PricingCatalog } from './catalog.js';
import type { OfferTerms } from './offer-terms.js';

const json=<T>(value:string|T):T=>typeof value==='string'?JSON.parse(value) as T:value;
export interface CommercialPrincipal { application:string; issuer:string; subject:string }
export interface QuoteSnapshot extends Record<string,unknown> {
  quoteId:string; application:string; issuer:string; subject:string; productCode:string; priceVersionId:string;
  amountMinor:string; currency:'CNY'; label:string; terms:OfferTerms; requestedVersion:string;
  createdAt:number; expiresAt:number; checkoutAvailable:false;
}
export interface TrialSnapshot extends Record<string,unknown> { application:string; priceVersionId:string; version:string; startedAt:number; expiresAt:number; terms:OfferTerms }
function principal(value:CommercialPrincipal) {
  if(value.issuer!==COMPANY_ISSUER || !companyApplications.some(row=>row.application===value.application) || !/^[A-Za-z0-9_-]{1,191}$/.test(value.subject))throw new ForbiddenError('Invalid company commercial identity');
}
function version(value:string){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value))throw new BadRequestError('Specify the software version or Atlas edition');}
async function active(client:DatabaseClient,who:CommercialPrincipal) {
  principal(who);
  const row=await client.query(`select e.user_id from customer_external_identities e join users u on u.id=e.user_id
    join customer_application_memberships m on m.issuer=e.issuer and m.subject=e.subject
    where e.issuer=$1 and e.subject=$2 and m.application=$3 and m.status='active' and u.status='active' for update`,[who.issuer,who.subject,who.application]);
  if(!row.rows.length)throw new ForbiddenError('Active company customer membership required');
}
export class CommercialService {
  constructor(private db:Database,private now=Date.now){}
  private async current(client:DatabaseClient,who:CommercialPrincipal,expected:string) {
    const product=companyApplications.find(row=>row.application===who.application)!;
    const head=(await client.query<{published_price_id:string|null}>('select published_price_id from pricing_products where product_code=$1 for update',[product.priceProductCode])).rows[0];
    if(!head?.published_price_id)throw new NotFoundError('No published offer');
    if(head.published_price_id!==expected)throw new ConflictError('Offer changed; review the current terms');
    const offer=await new PricingCatalog({...this.db,query:client.query.bind(client)},this.now).offer(product.priceProductCode);
    if(!offer.terms || !offer.eligibleForSale || offer.validUntil<=this.now())throw new ConflictError('Offer terms or current cost review are not ready');
    return offer;
  }
  async startTrial(who:CommercialPrincipal,requestedVersion:string,expectedPriceVersion:string) {
    version(requestedVersion);
    return this.db.withTransaction(async client=>{
      await active(client,who);
      const existing=(await client.query<{snapshot:string|TrialSnapshot}>('select snapshot from commercial_trials where application=$1 and issuer=$2 and subject=$3 for update',[who.application,who.issuer,who.subject])).rows[0];
      if(existing)return {...json(existing.snapshot),replayed:true};
      const offer=await this.current(client,who,expectedPriceVersion),terms=offer.terms!;
      if(!terms.trial.enabled)throw new ForbiddenError('This offer has no free trial');
      if(terms.model==='version_license' && terms.licensedVersion!==requestedVersion)throw new ConflictError('The offer covers a different software version');
      const startedAt=this.now(),expiresAt=startedAt+terms.trial.days*86400000;
      const snapshot:TrialSnapshot={application:who.application,priceVersionId:offer.priceVersionId,version:requestedVersion,startedAt,expiresAt,terms};
      await client.query('insert into commercial_trials(application,issuer,subject,price_version_id,started_at,expires_at,snapshot) values($1,$2,$3,$4,$5,$6,$7)',[who.application,who.issuer,who.subject,offer.priceVersionId,startedAt,expiresAt,snapshot]);
      return {...snapshot,replayed:false};
    });
  }
  async quote(who:CommercialPrincipal,requestedVersion:string,expectedPriceVersion:string,key:string) {
    version(requestedVersion);if(!/^[a-f0-9-]{36}$/.test(key))throw new BadRequestError('Invalid quote request key');
    return this.db.withTransaction(async client=>{
      await active(client,who);
      const actor='quote-'+who.application,hash=requestHash({who,requestedVersion,expectedPriceVersion});
      await client.query('insert into pricing_actions(actor_id,idempotency_key,request_hash,response) values($1,$2,$3,NULL) on duplicate key update actor_id=actor_id',[actor,key,hash]);
      const previous=(await client.query<{request_hash:string;response:string|QuoteSnapshot|null}>('select request_hash,response from pricing_actions where actor_id=$1 and idempotency_key=$2 for update',[actor,key])).rows[0]!;
      if(previous.request_hash!==hash)throw new ConflictError('Quote key belongs to another request');
      if(previous.response)return json(previous.response);
      const offer=await this.current(client,who,expectedPriceVersion),terms=offer.terms!;
      if(terms.model==='version_license' && terms.licensedVersion!==requestedVersion)throw new ConflictError('Choose the licensed software version');
      const snapshot:QuoteSnapshot={quoteId:randomUUID(),...who,productCode:offer.productCode,priceVersionId:offer.priceVersionId,amountMinor:offer.amountMinor,currency:'CNY',label:offer.label,terms,requestedVersion,createdAt:this.now(),expiresAt:Math.min(this.now()+900000,offer.validUntil),checkoutAvailable:false};
      await client.query('insert into commercial_quotes(id,application,issuer,subject,price_version_id,snapshot,expires_at) values($1,$2,$3,$4,$5,$6,$7)',[snapshot.quoteId,who.application,who.issuer,who.subject,offer.priceVersionId,snapshot,snapshot.expiresAt]);
      await client.query('update pricing_actions set response=$1 where actor_id=$2 and idempotency_key=$3',[snapshot,actor,key]);return snapshot;
    });
  }
  async access(who:CommercialPrincipal,requestedVersion:string) {
    version(requestedVersion);
    return this.db.withTransaction(async client=>{
      await active(client,who);
      const trials=await client.query<{snapshot:string|TrialSnapshot}>('select snapshot from commercial_trials where application=$1 and issuer=$2 and subject=$3',[who.application,who.issuer,who.subject]);
      const grants=await client.query<{snapshot:string|GrantSnapshot}>(`select g.snapshot from commercial_grants g join commercial_quotes q on q.id=g.quote_id where q.application=$1 and q.issuer=$2 and q.subject=$3 and g.status='active' and ((JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='version_license' and JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.licensedVersion'))=$4) or (JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.terms.model'))='monthly' and cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodStart')) as unsigned)<=$5 and $5<cast(JSON_UNQUOTE(JSON_EXTRACT(g.snapshot,'$.periodEnd')) as unsigned))) order by g.created_at desc limit 1`,[who.application,who.issuer,who.subject,requestedVersion,this.now()]);
      const now=this.now(),grant=grants.rows.map(row=>json(row.snapshot)).find(row=>row.terms.model==='version_license'?row.terms.licensedVersion===requestedVersion:row.periodStart!==null && row.periodEnd!==null && row.periodStart<=now && now<row.periodEnd);
      const trial=trials.rows[0]?json(trials.rows[0].snapshot):null;
      const trialActive=Boolean(trial && trial.version===requestedVersion && trial.startedAt<=now && now<trial.expiresAt);
      return {application:who.application,version:requestedVersion,entitled:Boolean(grant)||trialActive,basis:grant?'paid':trialActive?'trial':'none',grant:grant?{grantId:grant.grantId,priceVersionId:grant.priceVersionId,terms:grant.terms,periodStart:grant.periodStart,periodEnd:grant.periodEnd}:null,trial,checkoutAvailable:false as const};
    });
  }
}

export interface VerifiedSettlement {
  provider:string; eventId:string; paymentId:string; quoteId:string; state:'paid'|'refunded';
  amountMinor:string; currency:'CNY'; paidAt:number; periodStart:number|null; periodEnd:number|null;
}
interface GrantSnapshot extends QuoteSnapshot { grantId:string; paidAt:number; periodStart:number|null; periodEnd:number|null }
/** Trusted merchant adapter port only. There is deliberately no public HTTP
 * grant/settlement endpoint and no default verifier. Test ports are fixtures,
 * never evidence that collection, refunds or provider signatures are live. */
export class VerifiedSettlementWriter {
  constructor(private db:Database,private verify:(event:unknown)=>Promise<VerifiedSettlement>){}
  async apply(event:unknown) {
    const proof=await this.verify(event);
    if(!proof || !/^[a-z0-9-]{1,40}$/.test(proof.provider) || ![proof.eventId,proof.paymentId].every(id=>typeof id==='string' && /^[A-Za-z0-9_:.-]{1,160}$/.test(id)) || !/^[a-f0-9-]{36}$/.test(proof.quoteId) || !['paid','refunded'].includes(proof.state) || proof.currency!=='CNY' || !/^[1-9]\d{0,15}$/.test(proof.amountMinor) || !Number.isSafeInteger(proof.paidAt) || proof.paidAt<0)throw new BadRequestError('Invalid verified payment evidence');
    return this.db.withTransaction(async client=>{
      const hash=requestHash(proof);
      await client.query('insert into commercial_payment_events(provider,event_id,request_hash,response) values($1,$2,$3,NULL) on duplicate key update provider=provider',[proof.provider,proof.eventId,hash]);
      const previous=(await client.query<{request_hash:string;response:string|Record<string,unknown>|null}>('select request_hash,response from commercial_payment_events where provider=$1 and event_id=$2 for update',[proof.provider,proof.eventId])).rows[0]!;
      if(previous.request_hash!==hash)throw new ConflictError('Payment event replay changed');
      if(previous.response)return json(previous.response);
      const row=(await client.query<{snapshot:string|QuoteSnapshot}>('select snapshot from commercial_quotes where id=$1 for update',[proof.quoteId])).rows[0];
      if(!row)throw new NotFoundError('Payment quote unavailable');
      const quote=json(row.snapshot);
      if(quote.amountMinor!==proof.amountMinor || proof.paidAt<quote.createdAt || proof.paidAt>=quote.expiresAt)throw new ConflictError('Settlement does not match the accepted quote');
      if(quote.terms.model==='monthly' ? !Number.isSafeInteger(proof.periodStart) || !Number.isSafeInteger(proof.periodEnd) || proof.periodStart===null || proof.periodEnd===null || proof.periodStart>proof.paidAt || proof.periodEnd<=proof.paidAt || proof.periodEnd-proof.periodStart>32*86400000 : proof.periodStart!==null || proof.periodEnd!==null)throw new BadRequestError('Invalid monthly coverage or version-license term');
      const found=(await client.query<{id:string;quote_id:string;provider:string;payment_id:string;status:string}>('select id,quote_id,provider,payment_id,status from commercial_grants where quote_id=$1 or (provider=$2 and payment_id=$3) for update',[proof.quoteId,proof.provider,proof.paymentId])).rows;
      if(found.some(grant=>grant.quote_id!==proof.quoteId || grant.provider!==proof.provider || grant.payment_id!==proof.paymentId))throw new ConflictError('Payment identity belongs to another purchase');
      const current=found[0],grantId=current?.id ?? randomUUID(),status=current?.status==='refunded'||proof.state==='refunded'?'refunded':'active';
      const snapshot:GrantSnapshot={...quote,grantId,paidAt:proof.paidAt,periodStart:proof.periodStart,periodEnd:proof.periodEnd};
      if(current)await client.query('update commercial_grants set status=$1 where id=$2',[status,grantId]);
      else await client.query('insert into commercial_grants(id,quote_id,provider,payment_id,status,snapshot) values($1,$2,$3,$4,$5,$6)',[grantId,proof.quoteId,proof.provider,proof.paymentId,status,snapshot]);
      const response={grantId,status,quoteId:quote.quoteId};
      await client.query('update commercial_payment_events set response=$1 where provider=$2 and event_id=$3',[response,proof.provider,proof.eventId]);return response;
    });
  }
}

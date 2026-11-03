import {createHash,randomUUID} from 'node:crypto';
import type {Database,DatabaseClient} from '../db/pool.js';
import {BadRequestError,ConflictError,NotFoundError} from '../domain/errors.js';
import {companyApplications,COMPANY_ISSUER,CompanyRegistry} from '../company/registry.js';
import {requestHash} from '../http/request-hash.js';
import {PricingCatalog,type DraftPrice} from './catalog.js';
import {SubscriptionCatalog} from './subscription-catalog.js';
import {planDefinition} from './subscription-terms.js';
import {reviewCostScenario} from './cost-calculator.js';
import {CommercialService,VerifiedSettlementWriter,active,claimVerifiedPayment,type CommercialPrincipal,type QuoteSnapshot,type VerifiedSettlement} from './commercial-service.js';
import {selection,bundleKey,allocateDiscount,decode,action,finish,type BundleRule} from './bundle-rules.js';
const money=(minor:string)=>{const n=BigInt(minor);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;};
export interface BundleSelection {applications:string[];intervalMonths:number}
export class BundleService {
 constructor(private db:Database,private now=Date.now){}
 async catalog(){return {schemaVersion:1,applications:await Promise.all(companyApplications.map(async a=>({application:a.application,name:a.name,...await new SubscriptionCatalog(this.db,this.now).offers(a.priceProductCode)}))),checkoutAvailable:false};}
 private async review(c:DatabaseClient,input:BundleSelection){
  const chosen=selection(input.applications,input.intervalMonths),key=bundleKey(chosen);
  const head=(await c.query<{published_version_id:string|null}>('select published_version_id from bundle_rules where rule_key=$1 for update',[key])).rows[0];
  const version=head?.published_version_id?(await c.query<{payload:string|BundleRule}>('select payload from bundle_rule_versions where id=$1 and rule_key=$2 for share',[head.published_version_id,key])).rows[0]:null;
  const rule=version?decode(version.payload):null,applied=!!rule?.available&&rule.validUntil>this.now();
  const components:Array<{application:string;name:string;offer:Awaited<ReturnType<PricingCatalog['offer']>>;draft:DraftPrice}>=[];
  for(const application of chosen.applications){
   await new CompanyRegistry({...this.db,query:(sql,values)=>c.query(sql+' for share',values)}).application(application);
   const registered=companyApplications.find(a=>a.application===application)!;
   const plan=planDefinition(registered.priceProductCode,chosen.intervalMonths);
   await c.query('select published_price_id from pricing_products where product_code=$1 for update',[plan.planCode]);
   const catalog=new PricingCatalog({...this.db,query:c.query.bind(c)},this.now,true),offer=await catalog.offer(plan.planCode);
   if(offer.terms?.schemaVersion!==2||!offer.terms.available||offer.terms.intervalMonths!==chosen.intervalMonths)throw new ConflictError('A selected subscription period is unavailable');
   const payload=(await c.query<{payload:string|DraftPrice}>('select payload from pricing_versions where id=$1 for share',[offer.priceVersionId])).rows[0]!;
   components.push({application,name:registered.name,offer,draft:decode(payload.payload)});
  }
  const allocation=allocateDiscount(components.map(c=>({application:c.application,amountMinor:c.offer.amountMinor})),applied?rule.discountBps:0);
  const lines=allocation.lines.map(line=>{
   const component=components.find(c=>c.application===line.application)!;
   const eligible=component.offer.eligibleForSale&&component.offer.validUntil>this.now()&&reviewCostScenario({...component.draft.scenario,retailPrice:money(line.amountMinor)},component.offer.priceVersionId,component.offer.validUntil,this.now()).eligibleForSale;
   return {...line,name:component.name,priceVersionId:component.offer.priceVersionId,eligibleForSale:eligible};
  });
  const fingerprint=requestHash({chosen,ruleVersionId:head?.published_version_id??null,allocation,priceVersions:lines.map(l=>l.priceVersionId)});
  return {schemaVersion:1,...chosen,ruleVersionId:head?.published_version_id??null,ruleLabel:applied?rule.label:null,discountBps:applied?rule.discountBps:0,...allocation,lines,fingerprint,currency:'CNY' as const,validUntil:Math.min(...components.map(c=>c.offer.validUntil),...(applied?[rule.validUntil]:[])),eligibleForSale:lines.every(l=>l.eligibleForSale),checkoutAvailable:false as const};
 }
 async preview(input:BundleSelection){return this.db.withTransaction(c=>this.review(c,input));}
 async quote(who:CommercialPrincipal,input:BundleSelection,expectedFingerprint:string,key:string){
  if(typeof expectedFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(expectedFingerprint))throw new BadRequestError('Review the bundle before accepting');
  const chosen=selection(input.applications,input.intervalMonths);
  return this.db.withTransaction(async c=>{
   await active(c,who);const actor='bundle-'+who.application;
   const replay=await action(c,actor,key,{who,chosen,expectedFingerprint});if(replay)return replay;
   const pending=(await c.query<{n:number}>('select count(*) n from bundle_quotes where issuer=$1 and subject=$2 and expires_at>$3',[who.issuer,who.subject,this.now()])).rows[0]!;
   if(Number(pending.n)>=20)throw new ConflictError('Too many unexpired bundle quotes; reuse an accepted quote or wait for expiry');
   const reviewed=await this.review(c,chosen);
   if(reviewed.fingerprint!==expectedFingerprint)throw new ConflictError('Prices or bundle discount changed; review the new total');
   if(!reviewed.eligibleForSale||reviewed.validUntil<=this.now())throw new ConflictError('Discounted cost review is not eligible for sale');
   const at=this.now(),id=randomUUID(),commercial=new CommercialService(this.db,()=>at),lines:QuoteSnapshot[]=[];
   for(const line of reviewed.lines){
    const lineKey=randomUUID(),quoted=await commercial.quoteInTransaction(c,{...who,application:line.application},'current',line.priceVersionId,lineKey,{id});
    if(lines.length&&(quoted.periodStart!==lines[0]!.periodStart||quoted.calendarAnchorDay!==lines[0]!.calendarAnchorDay))throw new ConflictError('Existing subscription dates differ; reconcile coverage before buying a bundle');
    const adjusted={...line,...quoted,amountMinor:line.amountMinor,expiresAt:Math.min(quoted.expiresAt,reviewed.validUntil)};
    await c.query('update commercial_quotes set snapshot=$1,expires_at=$2 where id=$3',[adjusted,adjusted.expiresAt,adjusted.quoteId]);await finish(c,'quote-'+line.application,lineKey,adjusted);lines.push(adjusted);
   }
   const snapshot={...reviewed,quoteId:id,issuer:COMPANY_ISSUER,subject:who.subject,createdAt:at,expiresAt:Math.min(at+900000,reviewed.validUntil),periodStart:lines[0]!.periodStart,periodEnd:lines[0]!.periodEnd,lines};
   await c.query('insert into bundle_quotes(id,issuer,subject,snapshot,expires_at) values($1,$2,$3,$4,$5)',[id,who.issuer,who.subject,snapshot,snapshot.expiresAt]);
   for(const line of lines)await c.query('insert into bundle_quote_items(bundle_quote_id,application,quote_id,list_amount_minor,discount_minor,amount_minor) values($1,$2,$3,$4,$5,$6)',[id,line.application,line.quoteId,line.listAmountMinor,line.discountMinor,line.amountMinor]);
   await finish(c,actor,key,snapshot);return snapshot;
  });
 }
}
interface BundleQuote extends Record<string,unknown>{quoteId:string;issuer:string;subject:string;amountMinor:string;createdAt:number;expiresAt:number;periodStart:number;periodEnd:number;lines:QuoteSnapshot[]}
/** The provider adapter must verify aggregate amount, identity and payment status first. */
export class VerifiedBundleSettlementWriter {
 constructor(private db:Database,private verify:(event:unknown)=>Promise<VerifiedSettlement>){}
 async apply(event:unknown){
  const proof=await this.verify(event);
  if(!proof||!/^[a-z0-9-]{1,40}$/.test(proof.provider)||![proof.eventId,proof.paymentId].every(id=>typeof id==='string'&&/^[A-Za-z0-9_:.-]{1,160}$/.test(id))||!/^[a-f0-9-]{36}$/.test(proof.quoteId)||!['paid','refunded'].includes(proof.state)||proof.currency!=='CNY'||!/^[1-9]\d{0,15}$/.test(proof.amountMinor)||!Number.isSafeInteger(proof.paidAt)||proof.paidAt<0)throw new BadRequestError('Invalid verified aggregate evidence');
  return this.db.withTransaction(async c=>{
   const replay=await action(c,'bundle-settlement',createHash('sha256').update(proof.provider+':'+proof.eventId).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5'),proof);if(replay)return replay;
   const row=(await c.query<{snapshot:string|BundleQuote}>('select snapshot from bundle_quotes where id=$1 for update',[proof.quoteId])).rows[0];if(!row)throw new NotFoundError('Bundle quote unavailable');
   const q=decode(row.snapshot);
   const historical=await c.query('select id from commercial_grants where provider=$1 and payment_id=$2',[proof.provider,proof.paymentId]);if(historical.rows.length)throw new ConflictError('Payment receipt belongs to an existing single-app purchase');
   await claimVerifiedPayment(c,proof,'bundle');
   if(q.amountMinor!==proof.amountMinor||proof.paidAt<q.createdAt||proof.paidAt>=q.expiresAt||proof.periodStart!==q.periodStart||proof.periodEnd!==q.periodEnd)throw new ConflictError('Aggregate settlement does not match accepted bundle');
   const customer=(await c.query<{status:string}>('select u.status from customer_external_identities e join users u on u.id=e.user_id where e.issuer=$1 and e.subject=$2 for update',[q.issuer,q.subject])).rows[0];
   if(!customer||customer.status!=='active'&&proof.state==='paid')throw new ConflictError('Company account is closed');
   const prior=(await c.query<{quote_id:string;provider:string;payment_id:string;status:string}>('select quote_id,provider,payment_id,status from bundle_payments where quote_id=$1 or (provider=$2 and payment_id=$3) for update',[q.quoteId,proof.provider,proof.paymentId])).rows;
   if(prior.some(p=>p.quote_id!==q.quoteId||p.provider!==proof.provider||p.payment_id!==proof.paymentId))throw new ConflictError('Payment belongs to another bundle');
   const status=proof.state==='refunded'||prior[0]?.status==='refunded'?'refunded':'active';
   const writer=new VerifiedSettlementWriter(this.db,()=>Promise.reject(Error('Use verified aggregate port')));
   const grants=[];
   for(const line of q.lines){
    const suffix=(kind:string,value:string)=>'bundle-'+createHash('sha256').update(kind+':'+value+':'+line.application).digest('hex');
    grants.push(await writer.applyVerified(c,{...proof,state:status==='refunded'?'refunded':'paid',eventId:suffix('event',proof.eventId),paymentId:suffix('payment',proof.paymentId),quoteId:line.quoteId,amountMinor:line.amountMinor},q.quoteId));
   }
   if(prior.length)await c.query('update bundle_payments set status=$1 where quote_id=$2',[status,q.quoteId]);
   else await c.query('insert into bundle_payments(quote_id,provider,payment_id,status) values($1,$2,$3,$4)',[q.quoteId,proof.provider,proof.paymentId,status]);
   const response={quoteId:q.quoteId,status,grants};
   const eventKey=createHash('sha256').update(proof.provider+':'+proof.eventId).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
   await finish(c,'bundle-settlement',eventKey,response);return response;
  });
 }
}

import type { Database } from '../db/pool.js';
import { BadRequestError,ConflictError,NotFoundError } from '../domain/errors.js';
import { PricingCatalog,type DraftPrice } from './catalog.js';
import { planDefinition,subscriptionPeriods,validateSubscriptionTerms,type SubscriptionTerms } from './subscription-terms.js';
export class SubscriptionCatalog {
  private catalog:PricingCatalog;
  constructor(private db:Database,private now=Date.now){this.catalog=new PricingCatalog(db,now);}
  async history(productCode:string){
    return {productCode,plans:await Promise.all(subscriptionPeriods.map(async period=>{const p=planDefinition(productCode,period.months);return {...p,history:await this.catalog.history(p.planCode)};}))};
  }
  async createDraft(actor:string,key:string,input:DraftPrice){
    const terms=validateSubscriptionTerms(input.terms),plan=planDefinition(input.productCode,terms.intervalMonths);
    if(input.billingType!=='subscription')throw new BadRequestError('Only subscription offers may be created');
    return this.catalog.createDraft(actor,key,{...input,productCode:plan.planCode,terms});
  }
  async publish(actor:string,key:string,productCode:string,months:number,priceId:string,expectedId:string|null,note:string){
    const plan=planDefinition(productCode,months);
    const row=(await this.db.query<{payload:string|DraftPrice}>('select payload from pricing_versions where id=$1 and product_code=$2',[priceId,plan.planCode])).rows[0];
    if(!row)throw new NotFoundError('Subscription draft unavailable');
    const draft=typeof row.payload==='string'?JSON.parse(row.payload) as DraftPrice:row.payload;
    const terms=validateSubscriptionTerms(draft.terms);if(terms.intervalMonths!==months)throw new BadRequestError('Subscription period mismatch');
    return this.catalog.publish(actor,key,plan.planCode,priceId,expectedId,note);
  }
  async withdrawalDraft(actor:string,key:string,productCode:string,months:number,expectedId:string,expectedRevision:number){
    const plan=planDefinition(productCode,months);
    const head=(await this.db.query<{published_price_id:string|null}>('select published_price_id from pricing_products where product_code=$1',[plan.planCode])).rows[0];
    if(head?.published_price_id!==expectedId)throw new ConflictError('Published price changed; refresh before withdrawing');
    const row=(await this.db.query<{payload:string|DraftPrice}>('select payload from pricing_versions where id=$1 and product_code=$2',[expectedId,plan.planCode])).rows[0];
    if(!row)throw new NotFoundError('Published subscription unavailable');
    const draft=typeof row.payload==='string'?JSON.parse(row.payload) as DraftPrice:row.payload;
    const terms=validateSubscriptionTerms(draft.terms);
    return this.createDraft(actor,key,{...draft,productCode,expectedRevision,terms:{...terms,available:false}});
  }
  async offers(productCode:string){
    const plans=[];
    for(const period of subscriptionPeriods){
      const plan=planDefinition(productCode,period.months);
      try{
        const offer=await this.catalog.offer(plan.planCode),terms=validateSubscriptionTerms(offer.terms);
        if(terms.intervalMonths!==period.months)throw new ConflictError('Stored subscription period mismatch');
        if(!terms.available)continue;
        plans.push({planCode:plan.planCode,priceVersionId:offer.priceVersionId,revision:offer.revision,label:offer.label,unit:offer.unit,currency:'CNY' as const,amountMinor:offer.amountMinor,eligibleForSale:offer.eligibleForSale,validUntil:offer.validUntil,terms});
      }catch(error){if(error instanceof NotFoundError)continue;throw error;}
    }
    return {schemaVersion:2 as const,productCode,plans,commerceEnabled:false as const,autoChargeEnabled:false as const,paidAccessEnabled:false as const};
  }
}
export type PublishedSubscriptionTerms=SubscriptionTerms;

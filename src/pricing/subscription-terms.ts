import { BadRequestError } from '../domain/errors.js';
import { companyApplications } from '../company/registry.js';
export const subscriptionPeriods = [
  { id:'monthly',months:1,label:'月付',unit:'month' },
  { id:'quarterly',months:3,label:'季付',unit:'quarter' },
  { id:'yearly',months:12,label:'年付',unit:'year' },
  { id:'biennial',months:24,label:'两年付',unit:'two_years' },
] as const;
export type IntervalMonths = typeof subscriptionPeriods[number]['months'];
export interface SubscriptionTerms { schemaVersion:2; model:'subscription'; intervalMonths:IntervalMonths; available:boolean; trial:{enabled:boolean;days:number}; renewal:'manual' }
export const canonicalProduct=(code:string)=>companyApplications.some(row=>row.priceProductCode===code);
export function planDefinition(productCode:string,months:number) {
  const period=subscriptionPeriods.find(row=>row.months===months);
  if(!canonicalProduct(productCode)||!period)throw new BadRequestError('Choose a registered product and supported subscription period');
  return {...period,productCode,planCode:productCode+'-'+period.id};
}
export function subscriptionPlan(code:string) {
  for(const app of companyApplications)for(const period of subscriptionPeriods)if(code===app.priceProductCode+'-'+period.id)return planDefinition(app.priceProductCode,period.months);
  return undefined;
}
export function validateSubscriptionTerms(value:unknown):SubscriptionTerms {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestError('Subscription terms required');
  const t=value as SubscriptionTerms;
  if(Object.keys(t).sort().join(',')!=='available,intervalMonths,model,renewal,schemaVersion,trial'||t.schemaVersion!==2||t.model!=='subscription'||!subscriptionPeriods.some(p=>p.months===t.intervalMonths)||typeof t.available!=='boolean'||t.renewal!=='manual'||!t.trial||typeof t.trial!=='object'||Object.keys(t.trial).sort().join(',')!=='days,enabled'||typeof t.trial.enabled!=='boolean'||!Number.isInteger(t.trial.days)||(t.trial.enabled?t.trial.days<1||t.trial.days>365:t.trial.days!==0))throw new BadRequestError('Invalid subscription period, availability or trial settings');
  return structuredClone(t);
}
/** UTC calendar periods retain the initial day across February/clamped months. */
export function calendarPeriodEnd(start:number,months:IntervalMonths,anchorDay=new Date(start).getUTCDate()) {
  if(!Number.isSafeInteger(start)||start<0||!subscriptionPeriods.some(p=>p.months===months)||!Number.isInteger(anchorDay)||anchorDay<1||anchorDay>31)throw new BadRequestError('Invalid subscription calendar');
  const date=new Date(start);if(!Number.isFinite(date.getTime()))throw new BadRequestError('Invalid subscription date');
  const year=date.getUTCFullYear(),month=date.getUTCMonth()+months;
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(month);date.setUTCDate(Math.min(anchorDay,last));
  const end=date.getTime();if(!Number.isSafeInteger(end)||end<=start)throw new BadRequestError('Unsupported subscription date');return end;
}

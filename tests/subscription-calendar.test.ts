import {it,expect} from 'vitest';
import {calendarPeriodEnd,validateSubscriptionTerms,planDefinition,subscriptionPeriods,type SubscriptionTerms} from '../src/pricing/subscription-terms.js';
it('clamps UTC month ends, handles leap years and preserves the original anchor without using fixed30day months',()=>{
 const jan31=Date.UTC(2027,0,31,9,10,11,123),feb28=Date.UTC(2027,1,28,9,10,11,123);
 expect(calendarPeriodEnd(jan31,1)).toBe(feb28);expect(calendarPeriodEnd(feb28,1,31)).toBe(Date.UTC(2027,2,31,9,10,11,123));
 expect(calendarPeriodEnd(Date.UTC(2028,1,29,12),12)).toBe(Date.UTC(2029,1,28,12));expect(calendarPeriodEnd(Date.UTC(2028,1,29,12),24)).toBe(Date.UTC(2030,1,28,12));
 expect(calendarPeriodEnd(Date.UTC(2026,10,30,12),3)).toBe(Date.UTC(2027,1,28,12));
});
it('accepts only four subscription periods with explicit availability and bounded optional trial terms',()=>{
 const good:SubscriptionTerms={schemaVersion:2,model:'subscription',intervalMonths:1,available:true,trial:{enabled:true,days:30},renewal:'manual'};
 for(const p of subscriptionPeriods)expect(validateSubscriptionTerms({...good,intervalMonths:p.months}).intervalMonths).toBe(p.months);
 for(const bad of [{...good,intervalMonths:2},{...good,intervalMonths:'12'},{...good,available:1},{...good,licensedVersion:'v1'},{...good,renewal:'automatic'},{...good,trial:{enabled:false,days:30}},{...good,trial:{enabled:true,days:366}}])expect(()=>validateSubscriptionTerms(bad)).toThrow();
 expect(planDefinition('atlas-ai:access',24).planCode).toBe('atlas-ai:access-biennial');expect(()=>planDefinition('foreign:access',1)).toThrow();
});

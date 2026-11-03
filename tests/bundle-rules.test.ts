import {it,expect} from 'vitest';
import {selection,allocateDiscount,bundleKey} from '../src/pricing/bundle-rules.js';
it('matches exact app sets independent of order, without a three-app combination switch',()=>{
 const apps=['app-one','app-two','app-three','app-four'];
 expect(selection([apps[3],apps[0]],12,apps)).toEqual({applications:['app-four','app-one'],intervalMonths:12});
 expect(bundleKey(selection(['app-one','app-four'],12,apps))).toBe(bundleKey(selection(['app-four','app-one'],12,apps)));
 expect(()=>selection(['app-one','app-one'],1,apps)).toThrow();expect(()=>selection(['app-one','unknown'],1,apps)).toThrow();expect(()=>selection(['app-one','app-two'],2,apps)).toThrow();
});
it('allocates aggregate integer discounts with deterministic largest remainders and exact conservation',()=>{
 const input=[{application:'z',amountMinor:'101'},{application:'a',amountMinor:'101'},{application:'m',amountMinor:'101'}];
 const result=allocateDiscount(input,3333);expect(result.discountMinor).toBe('100');expect(result.amountMinor).toBe('203');expect(result.lines.map(l=>l.discountMinor)).toEqual(['34','33','33']);expect(allocateDiscount([...input].reverse(),3333)).toEqual(result);
 for(const bps of [0,1,999,1250,5000,9900]){const a=allocateDiscount([{application:'a',amountMinor:'19999'},{application:'b',amountMinor:'29998'}],bps);expect(a.lines.reduce((n,l)=>n+BigInt(l.amountMinor),0n)).toBe(BigInt(a.amountMinor));expect(a.lines.reduce((n,l)=>n+BigInt(l.discountMinor),0n)).toBe(BigInt(a.discountMinor));}
 expect(()=>allocateDiscount([{application:'a',amountMinor:'9007199254740991'},{application:'b',amountMinor:'1'}],1)).toThrow();expect(()=>allocateDiscount(input,10000)).toThrow();
});

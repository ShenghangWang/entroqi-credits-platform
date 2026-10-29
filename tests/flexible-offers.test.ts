import { expect,it } from 'vitest';
import { validateOfferTerms,type OfferTerms } from '../src/pricing/offer-terms.js';
import { parsePlatformOperators } from '../src/back-office/operators.js';
import { operatorFingerprint } from '../src/back-office/operator-source.js';
import { buildPrivateApp } from '../src/private-api.js';
import type { Database } from '../src/db/pool.js';
import { scenario } from './pricing-fixtures.js';
const terms:OfferTerms={schemaVersion:1,model:'version_license',licensedVersion:'v1',trial:{enabled:true,days:30},renewal:'manual'};
const owner={id:'owner',token:'o'.repeat(43),applications:['simulation'],pricingPermissions:['read','write','publish'] as ('read'|'write'|'publish')[]};
const reader={id:'manager',token:'r'.repeat(43),role:'admin' as const,applications:['atlas-ai'],pricingPermissions:['read' as const]};
const service={token:'s'.repeat(43),application:'simulation',issuer:'pricing-unit-fixture',onboarding:'self_service' as const,permissions:['catalog' as const]};
const db:Database={query:()=>Promise.reject(new Error('No database query expected')),withTransaction:()=>Promise.reject(new Error('No write expected')),close:()=>Promise.resolve()};
it('validates explicit bounded trial/version/monthly terms without enabling automatic charges',()=>{
  expect(validateOfferTerms(terms,'one_time')).toEqual(terms);
  expect(validateOfferTerms({...terms,model:'monthly',licensedVersion:null},'monthly').model).toBe('monthly');
  for(const value of [{...terms,licensedVersion:''},{...terms,licensedVersion:null},{...terms,trial:{enabled:false,days:30}},{...terms,trial:{enabled:true,days:0}},{...terms,trial:{enabled:true,days:366}},{...terms,trial:{enabled:true,days:1.5}},{...terms,renewal:'automatic'},{...terms,extra:true}])expect(()=>validateOfferTerms(value,'one_time')).toThrow();
  expect(()=>validateOfferTerms(terms,'monthly')).toThrow();
});
it('requires explicit pricing permissions and invalidates a session fingerprint when those grants change',()=>{
  expect(parsePlatformOperators(JSON.stringify([owner]))[0]!.pricingPermissions).toEqual(owner.pricingPermissions);
  expect(operatorFingerprint(owner)).not.toBe(operatorFingerprint({...owner,pricingPermissions:['read']}));
  for(const pricingPermissions of [['publish'],['read','read'],['read','invalid']])expect(()=>parsePlatformOperators(JSON.stringify([{...owner,pricingPermissions}]))).toThrow();
  expect(()=>parsePlatformOperators(JSON.stringify([{...owner,role:'agent',subject:'agent-subject'}]))).toThrow();
});
it('uses the existing HttpOnly console session for real calculator access while preserving owner/manager/app boundaries',async()=>{
  const app=await buildPrivateApp(db,[service],[],[owner,reader]),origin='http://127.0.0.1:3100';
  const login=async(id:string,password:string)=>{const response=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin},payload:{username:id,password}});return {origin,cookie:String(response.headers['set-cookie']).split(';')[0]!};};
  try{
    const url='/api/v1/platform/pricing/calculate';
    expect((await app.inject({method:'POST',url,payload:scenario(),headers:{authorization:'Bearer '+service.token,origin}})).statusCode).toBe(401);
    const headers=await login(owner.id,owner.token);
    const calculated=await app.inject({method:'POST',url,headers,payload:scenario()});expect(calculated.statusCode).toBe(200);expect(calculated.json()).toMatchObject({data:{contributionRounded:'72.21'}});
    expect((await app.inject({method:'POST',url,headers:{...headers,origin:'https://attacker.example'},payload:scenario()})).statusCode).toBe(403);
    const manager=await login(reader.id,reader.token);
    expect((await app.inject({method:'POST',url,headers:manager,payload:scenario()})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/platform/pricing/products/simulation:modeler-v1-local',headers:manager})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/v1/platform/pricing/versions',headers:manager,payload:{}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/api/v1/platform/pricing/products/atlas-ai:access/publish',headers:manager,payload:{priceVersionId:'00000000-0000-0000-0000-000000000000',expectedPublishedId:null,note:'manager cannot publish',idempotencyKey:'00000000-0000-0000-0000-000000000000'}})).statusCode).toBe(403);
    const redirect=await app.inject({url:'/v1/pricing'});expect(redirect.statusCode).toBe(302);expect(redirect.headers.location).toBe('/back-office/pricing');
    expect((await app.inject({url:'/v1/pricing/console.js'})).statusCode).toBe(404);
  }finally{await app.close();}
});

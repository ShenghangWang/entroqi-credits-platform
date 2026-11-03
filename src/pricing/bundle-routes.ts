import {createHash,timingSafeEqual} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {Database} from '../db/pool.js';
import type {ServiceCredential} from '../private-api.js';
import {DomainError} from '../domain/errors.js';
import {BundleService,type BundleSelection} from './bundle-service.js';
const digest=(v:string)=>createHash('sha256').update(v).digest();
export function registerBundleRoutes(app:FastifyInstance,db:Database,credentials:ServiceCredential[]){
 const bundles=new BundleService(db);
 app.post<{Body:BundleSelection&{action:'catalog'|'preview'|'quote';subject?:string;expectedFingerprint?:string;idempotencyKey?:string}}>('/v1/bundles',{bodyLimit:8192,schema:{body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{enum:['catalog','preview','quote']},applications:{type:'array',minItems:2,maxItems:32,uniqueItems:true,items:{type:'string',pattern:'^[a-z0-9-]{1,48}$'}},intervalMonths:{type:'integer',enum:[1,3,12,24]},subject:{type:'string',pattern:'^[A-Za-z0-9_-]{1,191}$'},expectedFingerprint:{type:'string',pattern:'^[a-f0-9]{64}$'},idempotencyKey:{type:'string',pattern:'^[a-f0-9-]{36}$'}}}}},async(req,reply)=>{
  reply.header('Cache-Control','no-store');const header=req.headers.authorization;
  const caller=typeof header==='string'&&/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)?credentials.find(c=>timingSafeEqual(digest(c.token),digest(header.slice(7)))):undefined;
  if(!caller)return reply.code(401).send({error:'unauthorized'});
  if(caller.identityMode!=='company'||!caller.permissions.includes('bundles'))return reply.code(403).send({error:'forbidden'});
  const b=req.body,keys=Object.keys(b).sort().join(','),expected=b.action==='catalog'?'action':b.action==='preview'?'action,applications,intervalMonths':'action,applications,expectedFingerprint,idempotencyKey,intervalMonths,subject';
  if(keys!==expected)return reply.code(400).send({error:'invalid_action_fields'});
  try{return b.action==='catalog'?await bundles.catalog():b.action==='preview'?await bundles.preview(b):await bundles.quote({application:caller.application,issuer:caller.issuer,subject:b.subject!},b,b.expectedFingerprint!,b.idempotencyKey!);}
  catch(error){if(error instanceof DomainError)return reply.code(({bad_request:400,forbidden:403,not_found:404,conflict:409} as Record<string,number>)[error.code]??400).send({error:error.code,message:error.message});return reply.code(503).send({error:'bundles_unavailable'});}
 });
}

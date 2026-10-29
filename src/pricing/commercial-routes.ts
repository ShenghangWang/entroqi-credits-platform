import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/pool.js';
import type { ServiceCredential } from '../private-api.js';
import { createHash,timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.js';
import { CommercialService } from './commercial-service.js';
const digest=(text:string)=>createHash('sha256').update(text).digest();
export function registerCommercialRoutes(app:FastifyInstance,db:Database,credentials:ServiceCredential[]){
  const commercial=new CommercialService(db);
  app.post<{Body:{subject:string;action:'status'|'trial'|'quote';version:string;expectedPriceVersionId?:string;idempotencyKey?:string}}>('/v1/commercial',{
    schema:{body:{type:'object',additionalProperties:false,required:['subject','action','version'],properties:{subject:{type:'string',pattern:'^[A-Za-z0-9_-]{1,191}$'},action:{enum:['status','trial','quote']},version:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'},expectedPriceVersionId:{type:'string',pattern:'^[a-f0-9-]{36}$'},idempotencyKey:{type:'string',pattern:'^[a-f0-9-]{36}$'}}}},
  },async(request,reply)=>{
    reply.header('Cache-Control','no-store');
    const token=request.headers.authorization;
    if(typeof token!=='string'||!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(token))return reply.code(401).send({error:'unauthorized'});
    const client=credentials.find(row=>timingSafeEqual(digest(row.token),digest(token.slice(7))));
    if(!client)return reply.code(401).send({error:'unauthorized'});
    if(client.identityMode!=='company'||!client.permissions.includes('commercial'))return reply.code(403).send({error:'forbidden'});
    const{subject,action,version,expectedPriceVersionId,idempotencyKey}=request.body;
    if(action==='status'?(expectedPriceVersionId!==undefined||idempotencyKey!==undefined):!expectedPriceVersionId || action==='trial'&&idempotencyKey!==undefined || action==='quote'&&!idempotencyKey)return reply.code(400).send({error:'invalid_action_fields'});
    const who={application:client.application,issuer:client.issuer,subject};
    try{return action==='status'?await commercial.access(who,version):action==='trial'?await commercial.startTrial(who,version,expectedPriceVersionId!):await commercial.quote(who,version,expectedPriceVersionId!,idempotencyKey!);}
    catch(error){if(error instanceof DomainError)return reply.code(({bad_request:400,forbidden:403,not_found:404,conflict:409} as Record<string,number>)[error.code]??400).send({error:error.code,message:error.message});return reply.code(503).send({error:'commercial_unavailable'});}
  });
}

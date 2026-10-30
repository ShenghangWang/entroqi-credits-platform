import type { FastifyInstance,FastifyRequest,FastifyReply } from 'fastify';
import type { Database } from '../db/pool.js';
import { DomainError } from '../domain/errors.js';
import type { PlatformOperator } from './operators.js';
import { type OperatorSource,StaffLoginThrottle } from './operator-source.js';
import { createOwner,type CreateOwnerInput } from './staff-administration.js';
import { flushStaffAudit,listAudit } from './audit-trail.js';
interface Access {guard(request:FastifyRequest,reply:FastifyReply):Promise<unknown>;caller(request:FastifyRequest):PlatformOperator|undefined;sameOrigin(request:FastifyRequest):boolean;headers:Record<string,string>}
export function registerAdministrationRoutes(app:FastifyInstance,db:Database,source:OperatorSource,access:Access) {
 const base='/api/v1/platform/owner-administration',throttle=new StaffLoginThrottle();
 const guard=async(req:FastifyRequest,reply:FastifyReply)=>{await access.guard(req,reply);if(reply.sent)return;if((access.caller(req)!.role??'developer')!=='developer')return reply.code(403).send({message:'仅公司所有者可管理所有者账号及查看操作记录。'});if(req.method!=='GET'&&!access.sameOrigin(req))return reply.code(403).send({message:'来源校验失败。'});};
 const run=async(reply:FastifyReply,operation:()=>Promise<unknown>)=>{reply.headers(access.headers);try{return {code:0,message:'ok',data:await operation()};}catch(e){if(e instanceof DomainError)return reply.code(({bad_request:400,forbidden:403,conflict:409} as Record<string,number>)[e.code]??400).send({message:e.message});return reply.code(503).send({message:'所有者管理或操作记录暂不可用，请稍后重试。'});}};
 app.get(base,{preHandler:guard},(_req,reply)=>run(reply,async()=>({managed:source.managed,owners:(await source.read()).filter(o=>(o.role??'developer')==='developer').map(o=>({id:o.id,displayName:o.displayName??'公司所有者',applications:o.applications,pricingPermissions:o.pricingPermissions??[]}))})));
 app.post<{Body:CreateOwnerInput}>(base+'/owners',{preHandler:guard,bodyLimit:4096,schema:{body:{type:'object',additionalProperties:false,required:['idempotencyKey','username','displayName','newCredential','currentCredential','reason','confirmed'],properties:{idempotencyKey:{type:'string',pattern:'^[a-f0-9-]{36}$'},username:{type:'string',pattern:'^[A-Za-z0-9_-]{3,64}$'},displayName:{type:'string',minLength:1,maxLength:80},newCredential:{type:'string',minLength:43,maxLength:128},currentCredential:{type:'string',maxLength:128},reason:{type:'string',minLength:8,maxLength:300},confirmed:{const:true}}}}},(req,reply)=>run(reply,async()=>{
  if(!throttle.take(req.ip)){reply.header('Retry-After','60');throw new DomainError('尝试过于频繁，请稍后重试。','bad_request');}
  if(!source.file)return reply.code(409).send({message:'请先配置受保护的后台凭证文件，再从控制台创建所有者。'});
  const result=await createOwner(source.file,access.caller(req)!,req.body,source.reservedTokens??[]);
  // The committed authority document already holds durable audit evidence. DB export retries on next read/timer.
  try{await flushStaffAudit(source.file,db);}catch{app.log.warn('Staff audit export pending; authoritative outbox retained');}
  return result;
 }));
 app.get<{Querystring:{page?:number;pageSize?:number;actorId?:string}}>(base+'/audit',{preHandler:guard,schema:{querystring:{type:'object',additionalProperties:false,properties:{page:{type:'integer',minimum:1,maximum:1000000},pageSize:{type:'integer',minimum:1,maximum:100},actorId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,64}$'}}}}},(req,reply)=>run(reply,async()=>{await flushStaffAudit(source.file,db);return listAudit(db,access.caller(req)!.applications,req.query.page??1,req.query.pageSize??20,req.query.actorId);}));
 let running:Promise<void>|undefined;const timer=source.file?setInterval(()=>{if(!running)running=flushStaffAudit(source.file,db).catch(()=>{app.log.warn('Staff audit outbox needs operator attention');}).finally(()=>{running=undefined;});},5000):undefined;timer?.unref();app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
}

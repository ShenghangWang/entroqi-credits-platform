import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PlatformOperator } from './operators.js';
import { OwnerRecoveryService, RecoveryUnavailable, OwnerRecoveryDenied } from './owner-recovery.js';
import { StaffLoginThrottle } from './operator-source.js';
import { createOwnerMailSender } from './recovery-mail.js';

interface Access {
  guard(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  caller(request: FastifyRequest): PlatformOperator | undefined;
  sameOrigin(request: FastifyRequest): boolean;
  headers: Record<string,string>;
}
export function registerOwnerRecoveryRoutes(app: FastifyInstance, file: string | undefined, access: Access) {
  const throttle=new StaffLoginThrottle();
  const sender=createOwnerMailSender(),key=process.env.CREDITS_OWNER_RECOVERY_SECRET;
  if(sender && (!file || !key)) throw new Error('Owner email recovery requires private file mode and a recovery secret');
  const service=file && key ? new OwnerRecoveryService(file,key,sender) : undefined;
  let running: Promise<void> | undefined;
  const timer=service?.senderReady ? setInterval(()=>{
    if(running)return;
    running=service.drain().catch(()=>{ app.log.warn('Owner recovery mail worker needs operator attention'); }).finally(()=>{running=undefined;});
  },5000) : undefined;
  timer?.unref();
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
  const wrap=(data:unknown)=>({code:0,message:'ok',data});
  const run=async(request:FastifyRequest,reply:FastifyReply,action:(ownerService:OwnerRecoveryService)=>Promise<unknown>)=>{
    reply.headers(access.headers);
    if(request.method!=='GET' && !access.sameOrigin(request))return reply.code(403).send({message:'来源校验失败。'});
    if(request.method!=='GET' && !throttle.take(request.ip))return reply.header('Retry-After','60').code(429).send({code:'RECOVERY_RATE_LIMIT',message:'尝试过于频繁，请稍后重试。'});
    if(!service)return reply.code(503).send({code:'RECOVERY_NOT_CONFIGURED',message:'公司所有者邮箱恢复尚未配置。请使用授权运维恢复流程。'});
    try{const result=await action(service);return result===null || result===false ? reply.code(400).send({code:'RECOVERY_INVALID',message:'恢复信息无效、已使用或已过期。'}) : wrap(result);}
    catch(error){if(error instanceof OwnerRecoveryDenied)return reply.code(403).send({code:'OWNER_REAUTHENTICATION_REQUIRED',message:'仅公司所有者可配置恢复方式，且须重新验证当前凭证。'});return reply.code(503).send({code:'RECOVERY_UNAVAILABLE',message:error instanceof RecoveryUnavailable?'邮箱恢复尚未就绪。请联系授权运维。':'恢复服务暂不可用。请稍后重试或联系授权运维。'});}
  };
  const string=(maxLength:number)=>({type:'string',minLength:1,maxLength});
  const schema=(properties:Record<string,unknown>)=>({body:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}});
  const authenticated={preHandler:async(request:FastifyRequest,reply:FastifyReply)=>{await access.guard(request,reply);}};
  app.get('/api/v1/auth/owner-recovery/profile',authenticated,(request,reply)=>run(request,reply,s=>s.profile(access.caller(request)!)));
  app.post<{Body:{email:string;currentCredential:string}}>('/api/v1/auth/owner-recovery/enroll/request',{
    ...authenticated,schema:schema({email:string(254),currentCredential:string(128)}),
  },(request,reply)=>run(request,reply,s=>s.request(request.body.email,request.ip,access.caller(request),request.body.currentCredential)));
  app.post<{Body:{email:string;currentCredential:string;challengeId:string;code:string}}>('/api/v1/auth/owner-recovery/enroll/verify',{
    ...authenticated,schema:schema({email:string(254),currentCredential:string(128),challengeId:string(43),code:string(8)}),
  },(request,reply)=>run(request,reply,s=>s.verifyEnrollment(access.caller(request)!,request.body.currentCredential,request.body.email,request.body.challengeId,request.body.code)));
  app.post<{Body:{currentCredential:string;offlineRecoveryCode:string}}>('/api/v1/auth/owner-recovery/enroll/activate',{
    ...authenticated,schema:schema({currentCredential:string(128),offlineRecoveryCode:string(43)}),
  },(request,reply)=>run(request,reply,s=>s.activate(access.caller(request)!,request.body.currentCredential,request.body.offlineRecoveryCode)));
  app.post<{Body:{email:string}}>('/api/v1/auth/owner-recovery/request',{schema:schema({email:string(254)})},(request,reply)=>run(request,reply,s=>s.request(request.body.email,request.ip)));
  app.post<{Body:{email:string;challengeId:string;code:string;offlineRecoveryCode:string}}>('/api/v1/auth/owner-recovery/verify',{
    schema:schema({email:string(254),challengeId:string(43),code:string(8),offlineRecoveryCode:string(43)}),
  },(request,reply)=>run(request,reply,s=>s.verifyRecovery(request.body.email,request.body.challengeId,request.body.code,request.body.offlineRecoveryCode,request.ip)));
  app.post<{Body:{resetTicket:string}}>('/api/v1/auth/owner-recovery/reset',{schema:schema({resetTicket:string(43)})},(request,reply)=>run(request,reply,s=>s.complete(request.body.resetTicket)));
  return {mailReady:Boolean(service?.senderReady),requiresOfflineRecoveryCode:true};
}

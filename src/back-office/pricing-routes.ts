import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/pool.js';
import type { PlatformOperator } from './operators.js';
import { calculateCostScenario } from '../pricing/cost-calculator.js';
import { type DraftPrice } from '../pricing/catalog.js';
import { SubscriptionCatalog } from '../pricing/subscription-catalog.js';
import { companyApplications,COMPANY_ISSUER } from '../company/registry.js';
import { DomainError,ForbiddenError } from '../domain/errors.js';
interface Access {
  guard(request:FastifyRequest,reply:FastifyReply):Promise<unknown>;
  caller(request:FastifyRequest):PlatformOperator|undefined;
  sameOrigin(request:FastifyRequest):boolean;
  headers:Record<string,string>;
}
export function registerBackOfficePricing(app:FastifyInstance,db:Database,access:Access){
  const catalog=new SubscriptionCatalog(db),base='/api/v1/platform/pricing';
  const guard=(permission:'read'|'write'|'publish')=>async(request:FastifyRequest,reply:FastifyReply)=>{
    await access.guard(request,reply);if(reply.sent)return;
    const operator=access.caller(request)!;
    if(!operator.pricingPermissions?.includes(permission))return reply.code(403).send({message:'当前账号没有此定价权限。'});
    if(request.method!=='GET'&&!access.sameOrigin(request))return reply.code(403).send({message:'来源校验失败。'});
    const product=(request.params as {productCode?:unknown})?.productCode ?? (request.body as {productCode?:unknown})?.productCode;
    if(product!==undefined && !companyApplications.some(row=>row.priceProductCode===product && operator.applications.includes(row.application)))return reply.code(403).send({message:'产品不在当前账号的管理范围内。'});
  };
  const execute=async(operation:()=>unknown,reply:FastifyReply)=>{
    reply.headers(access.headers);
    try{return {code:0,message:'ok',data:await operation()};}
    catch(error){if(error instanceof DomainError)return reply.code(({bad_request:400,forbidden:403,not_found:404,conflict:409} as Record<string,number>)[error.code]??400).send({code:error.code,message:error.message});
      return reply.code(503).send({message:'定价服务暂不可用，请稍后重试。'});}
  };
  app.get(base+'/products',{preHandler:guard('read')},(request,reply)=>execute(async()=>({products:await Promise.all(companyApplications.filter(row=>access.caller(request)!.applications.includes(row.application)).map(async row=>({...row,...await catalog.history(row.priceProductCode)}))),permissions:access.caller(request)!.pricingPermissions}),reply));
  app.post(base+'/calculate',{bodyLimit:32768,preHandler:guard('read')},(request,reply)=>execute(()=>calculateCostScenario(request.body),reply));
  app.get<{Params:{productCode:string}}>(base+'/products/:productCode',{preHandler:guard('read')},(request,reply)=>execute(()=>catalog.history(request.params.productCode),reply));
  app.post<{Body:DraftPrice&{idempotencyKey:string}}>(base+'/versions',{
    bodyLimit:32768,preHandler:guard('write'),schema:{body:{type:'object',additionalProperties:false,
      required:['productCode','label','billingType','unit','price','expectedRevision','scenario','validUntil','evidenceNote','terms','idempotencyKey'],
      properties:{productCode:{type:'string'},label:{type:'string'},billingType:{enum:['subscription']},unit:{type:'string'},price:{type:'string'},expectedRevision:{type:'integer',minimum:0},scenario:{type:'object'},validUntil:{type:'integer',minimum:0},evidenceNote:{type:'string'},terms:{type:'object'},idempotencyKey:{type:'string'}}}},
  },(request,reply)=>execute(()=>{const{idempotencyKey,...input}=request.body;return catalog.createDraft(access.caller(request)!.id,idempotencyKey,input);},reply));
  app.post<{Params:{productCode:string};Body:{intervalMonths:number;priceVersionId:string;expectedPublishedId:string|null;note:string;idempotencyKey:string}}>(base+'/products/:productCode/publish',{
    preHandler:guard('publish'),schema:{body:{type:'object',additionalProperties:false,required:['intervalMonths','priceVersionId','expectedPublishedId','note','idempotencyKey'],properties:{intervalMonths:{type:'integer',enum:[1,3,12,24]},priceVersionId:{type:'string'},expectedPublishedId:{type:['string','null']},note:{type:'string'},idempotencyKey:{type:'string'}}}},
  },(request,reply)=>execute(()=>catalog.publish(access.caller(request)!.id,request.body.idempotencyKey,request.params.productCode,request.body.intervalMonths,request.body.priceVersionId,request.body.expectedPublishedId,request.body.note),reply));
  app.post<{Params:{productCode:string};Body:{intervalMonths:number;expectedPublishedId:string;expectedRevision:number;idempotencyKey:string}}>(base+'/products/:productCode/withdrawal-draft',{
    preHandler:guard('write'),schema:{body:{type:'object',additionalProperties:false,required:['intervalMonths','expectedPublishedId','expectedRevision','idempotencyKey'],properties:{intervalMonths:{type:'integer',enum:[1,3,12,24]},expectedPublishedId:{type:'string'},expectedRevision:{type:'integer',minimum:0},idempotencyKey:{type:'string'}}}},
  },(request,reply)=>execute(()=>catalog.withdrawalDraft(access.caller(request)!.id,request.body.idempotencyKey,request.params.productCode,request.body.intervalMonths,request.body.expectedPublishedId,request.body.expectedRevision),reply));
  app.get<{Querystring:{page?:number;pageSize?:number;application?:string}}>(base+'/contracts',{preHandler:guard('read'),schema:{querystring:{type:'object',additionalProperties:false,properties:{application:{type:'string',enum:['simulation','atlas-simulation','atlas-ai']},page:{type:'integer',minimum:1,maximum:1000000},pageSize:{type:'integer',minimum:1,maximum:100}}}}},(request,reply)=>execute(async()=>{
    const scope=access.caller(request)!.applications;if(request.query.application&&!scope.includes(request.query.application))throw new ForbiddenError('Application outside staff scope');const apps=request.query.application?[request.query.application]:scope,page=request.query.page??1,pageSize=request.query.pageSize??20,values=[COMPANY_ISSUER,...apps];
    const where=`s.issuer=$1 and s.application in (${apps.map((_,i)=>'$'+(i+2)).join(',')})`;
    const from=`from commercial_subscription_terms s join commercial_grants g on g.id=s.grant_id join customer_external_identities e on e.issuer=s.issuer and e.subject=s.subject join users u on u.id=e.user_id where ${where}`;
    const rows=await db.query(`select s.grant_id grantId,s.application,s.subject,cast(e.user_id as char) customerId,coalesce(u.username,concat('客户 #',e.user_id)) customerName,s.interval_months intervalMonths,cast(s.amount_minor as char) amountMinor,s.currency,s.period_start periodStart,s.period_end periodEnd,s.price_version_id priceVersionId,g.status ${from} order by g.created_at desc,g.id limit ${pageSize} offset ${(page-1)*pageSize}`,values);
    const total=await db.query<{total:number}>(`select count(*) total ${from}`,values);return {rows:rows.rows,total:Number(total.rows[0]?.total??0),page,pageSize};
  },reply));

}

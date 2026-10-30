import type { Database } from '../db/pool.js';
import { readPrivateFile } from './operator-source.js';
import { withLock,atomicReplace } from './credential-maintenance.js';
import { parseStaffDocument,serializeStaffDocument } from './staff-document.js';
import { companyApplications } from '../company/registry.js';

export async function flushStaffAudit(file:string|undefined,db:Database) {
 if(!file)return;
 const pending=parseStaffDocument(await readPrivateFile(file)).auditOutbox??[];if(!pending.length)return;
 await db.withTransaction(async client=>{for(const e of pending)await client.query('insert into staff_audit_events(event_id,occurred_at,actor_id,action,target_id,reason,details) values($1,$2,$3,$4,$5,$6,$7) on duplicate key update event_id=event_id',[e.id,e.at,e.actorId,e.action,e.targetId,e.reason,e.details]);});
 // A crash after SQL commit safely retries the same UUID; never acknowledge before commit.
 await withLock(file,async()=>{const doc=parseStaffDocument(await readPrivateFile(file)),ids=new Set(pending.map(e=>e.id));doc.auditOutbox=(doc.auditOutbox??[]).filter(e=>!ids.has(e.id));await atomicReplace(file,serializeStaffDocument(doc));});
}
const snapshot=(alias:string)=>`if(${alias}.id is null,null,JSON_OBJECT('priceVersionId',${alias}.id,'revision',${alias}.revision,'price',JSON_UNQUOTE(JSON_EXTRACT(${alias}.payload,'$.price')),'terms',JSON_EXTRACT(${alias}.payload,'$.terms')))`;
export async function listAudit(db:Database,applications:string[],page:number,pageSize:number,actorId?:string) {
 const slots=applications.map((_,i)=>'$'+(i+1)).join(','),values:unknown[]=[...applications];
 // Native price history is already transactional with its change. Reuse it rather than duplicate it.
 const union=`select concat('draft:',v.id) eventId,cast(UNIX_TIMESTAMP(v.created_at)*1000 as unsigned) occurredAt,v.created_by actorId,'pricing.draft_saved' action,substring_index(v.product_code,':',1) application,v.product_code targetId,JSON_UNQUOTE(JSON_EXTRACT(v.payload,'$.evidenceNote')) reason,${snapshot('old')} beforeDetails,${snapshot('v')} afterDetails from pricing_versions v left join pricing_versions old on old.product_code=v.product_code and old.revision=v.revision-1 where substring_index(v.product_code,':',1) in (${slots})
 union all select concat('publication:',p.id),cast(UNIX_TIMESTAMP(p.created_at)*1000 as unsigned),p.actor_id,case when JSON_EXTRACT(v.payload,'$.terms.available')=false then 'pricing.plan_withdrawn' else 'pricing.published' end,substring_index(p.product_code,':',1),p.product_code,p.note,${snapshot('old')},${snapshot('v')} from pricing_publications p join pricing_versions v on v.id=p.price_version_id left join pricing_versions old on old.id=p.previous_price_id where substring_index(p.product_code,':',1) in (${slots})
 union all select concat('staff:',event_id),occurred_at,actor_id,action,null,target_id,reason,null,details from staff_audit_events`;
 const filter=actorId?'where actorId=$'+(values.push(actorId)):'';
 const [rows,total]=await Promise.all([db.query(`select * from (${union}) h ${filter} order by occurredAt desc,eventId desc limit ${pageSize} offset ${(page-1)*pageSize}`,values),db.query<{total:number}>(`select count(*) total from (${union}) h ${filter}`,values)]);
 return {rows:rows.rows.map(r=>({...r,occurredAt:Number(r.occurredAt),beforeDetails:typeof r.beforeDetails==='string'?JSON.parse(r.beforeDetails) as unknown:r.beforeDetails,afterDetails:typeof r.afterDetails==='string'?JSON.parse(r.afterDetails) as unknown:r.afterDetails})),total:Number(total.rows[0]?.total??0),page,pageSize,applications:companyApplications.filter(a=>applications.includes(a.application)).map(a=>({code:a.application,name:a.name}))};
}

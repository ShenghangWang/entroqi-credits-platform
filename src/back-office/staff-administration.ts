import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { atomicReplace, withLock } from './credential-maintenance.js';
import { readPrivateFile, operatorFingerprint } from './operator-source.js';
import { parseStaffDocument, serializeStaffDocument, type StaffDocument, type StaffAuditEvent } from './staff-document.js';
import type { PlatformOperator } from './operators.js';
import { BadRequestError, ConflictError, ForbiddenError } from '../domain/errors.js';
export const equalCredential=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export function queueStaffAudit(document:StaffDocument,event:Omit<StaffAuditEvent,'id'|'at'>,now=Date.now()) {
 const pending=document.auditOutbox??=[];if(pending.length>=64)throw new Error('Staff audit outbox full; restore audit storage before changing security state');
 const row={id:randomUUID(),at:now,...event};pending.push(row);return row;
}
export interface CreateOwnerInput { idempotencyKey:string; username:string; displayName:string; newCredential:string; currentCredential:string; reason:string; confirmed:boolean }
export async function createOwner(file:string,actor:PlatformOperator,input:CreateOwnerInput,reservedTokens:string[]=[]) {
 if(!input || !/^[a-f0-9-]{36}$/.test(input.idempotencyKey) || !/^[A-Za-z0-9_-]{3,64}$/.test(input.username) || typeof input.displayName!=='string' || !input.displayName.trim() || input.displayName.length>80 || [...input.displayName].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) || !/^[A-Za-z0-9_-]{43,128}$/.test(input.newCredential) || typeof input.reason!=='string' || input.reason.trim().length<8 || input.reason.length>300 || [...input.reason].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) || input.confirmed!==true) throw new BadRequestError('填写独立账号、名称、强随机凭证、原因并确认最高权限。');
 return withLock(file,async()=>{
  const document=parseStaffDocument(await readPrivateFile(file)),current=document.operators.find(row=>row.id===actor.id);
  if(typeof input.currentCredential!=='string' || !current || (current.role??'developer')!=='developer' || operatorFingerprint(current)!==operatorFingerprint(actor) || !equalCredential(current.token,input.currentCredential))throw new ForbiddenError('仅公司所有者可操作，请重新验证当前凭证。');
  const requestHash=createHash('sha256').update(JSON.stringify({username:input.username,displayName:input.displayName.trim(),credentialHash:createHash('sha256').update(input.newCredential).digest('hex'),reason:input.reason.trim()})).digest('hex');
  const prior=document.ownerCreations?.find(row=>row.actorId===current.id && row.key===input.idempotencyKey);
  if(prior){if(prior.requestHash!==requestHash)throw new ConflictError('重复请求与原操作不一致。');return {ownerId:prior.targetId,eventId:prior.eventId,replayed:true};}
  if(document.operators.length>=16 || (document.ownerCreations?.length??0)>=16)throw new ConflictError('后台账号容量已满，请联系授权运维。');
  if(document.operators.some(row=>row.id.toLowerCase()===input.username.toLowerCase() || equalCredential(row.token,input.newCredential)) || reservedTokens.some(token=>equalCredential(token,input.newCredential)))throw new ConflictError('账号已存在，或凭证必须与现有账号及服务凭证不同。');
  const created:PlatformOperator={id:input.username,displayName:input.displayName.trim(),token:input.newCredential,role:'developer',applications:[...current.applications],...(current.pricingPermissions?{pricingPermissions:[...current.pricingPermissions]}:{})};
  document.operators.push(created);
  const event=queueStaffAudit(document,{actorId:current.id,action:'owner.created',targetId:created.id,reason:input.reason.trim(),details:{displayName:created.displayName,applications:created.applications,pricingPermissions:created.pricingPermissions??[]}});
  (document.ownerCreations??=[]).push({key:input.idempotencyKey,actorId:current.id,requestHash,targetId:created.id,eventId:event.id});
  // Authority and audit evidence commit together. The outbox survives DB outage.
  await atomicReplace(file,serializeStaffDocument(document));return {ownerId:created.id,eventId:event.id,replayed:false};
 });
}

<script setup lang="ts">
import {onMounted,onBeforeUnmount,reactive,ref} from 'vue'
import {useRoute} from 'vue-router'
import {request} from '@/api/http'
import {useAuthStore} from '@/stores/auth'
type Owner={id:string;displayName:string;applications:string[];pricingPermissions:string[]}
type Event={eventId:string;occurredAt:number;actorId:string;action:string;application:string|null;targetId:string;reason:string;beforeDetails:Record<string,unknown>|null;afterDetails:Record<string,unknown>|null}
type Reply<T>={data:T}
const auth=useAuthStore(),route=useRoute(),base='/platform/owner-administration',owners=ref<Owner[]>([]),events=ref<Event[]>([]),managed=ref(false),loading=ref(false),busy=ref(false),error=ref(''),success=ref(''),showCreate=ref(route.query.create==='1'),page=ref(1),total=ref(0),actor=ref('')
const form=reactive({username:'',displayName:'',newCredential:'',currentCredential:'',reason:'',confirmed:false})
let attempt:{key:string;body:string}|undefined,alive=true,generation=0
const actionLabel=(action:string)=>({'bundles.draft_saved':'保存组合优惠草稿','bundles.published':'发布组合优惠','bundles.withdrawn':'停止组合优惠','owner.created':'创建公司所有者','owner.recovery_status_changed':'恢复设置变更','owner.credential_recovered':'凭证恢复','pricing.draft_saved':'保存价格草稿','pricing.published':'发布价格','pricing.plan_withdrawn':'停售方案'} as Record<string,string>)[action]??action
const appLabel=(value:string|null)=>({'simulation':'模拟平台','atlas-simulation':'Simulation Atlas','atlas-ai':'Modern AI Atlas'} as Record<string,string>)[value??'']??value??'公司账号'
function details(value:Record<string,unknown>|null){if(!value)return '—';if(Array.isArray(value.applications)&&typeof value.discountBps==='number')return value.applications.map(v=>appLabel(String(v))).join(' + ')+` · ${value.intervalMonths}个月 · ${value.discountBps/100}%优惠 · ${value.available?'提供优惠':'已停止优惠'}`;const terms=value.terms as {intervalMonths?:number;available?:boolean;trial?:{enabled:boolean;days:number}}|undefined;if(typeof value.price==='string')return `¥${value.price} · ${terms?.intervalMonths??'历史'}个月 · ${terms?.available===false?'已停售':'可购买'} · ${terms?.trial?.enabled?terms.trial.days+'天试用':'无试用'} · 修订${value.revision}`;return JSON.stringify(value)}
async function load(){const ticket=++generation;loading.value=true;error.value='';try{const [a,b]=await Promise.all([request.get<Reply<{managed:boolean;owners:Owner[]}>>(base),request.get<Reply<{rows:Event[];total:number}>>(base+'/audit',{params:{page:page.value,pageSize:20,...(actor.value?{actorId:actor.value}:{})}})]);if(!alive||ticket!==generation)return;managed.value=a.data.managed;owners.value=a.data.owners;events.value=b.data.rows;total.value=b.data.total;}catch(e){if(alive&&ticket===generation)error.value=e instanceof Error?e.message:'读取失败'}finally{if(alive&&ticket===generation)loading.value=false}}
function generate(){const bytes=crypto.getRandomValues(new Uint8Array(32));form.newCredential=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function copy(){try{await navigator.clipboard.writeText(form.newCredential);success.value='新凭证已复制，请单独交给账号本人并保存到密码管理器。'}catch{error.value='无法访问剪贴板，请手动选择并保存新凭证。'}}
function cancel(){showCreate.value=false;form.newCredential='';form.currentCredential='';form.confirmed=false;attempt=undefined}
async function create(){busy.value=true;error.value='';success.value='';try{const body=JSON.stringify({username:form.username,displayName:form.displayName,newCredential:form.newCredential,reason:form.reason,confirmed:form.confirmed});if(attempt?.body!==body)attempt={key:crypto.randomUUID(),body};const result=(await request.post<Reply<{ownerId:string}>>(base+'/owners',{...form,idempotencyKey:attempt.key})).data;success.value=`已创建独立所有者账号：${result.ownerId}。请使用其独立凭证登录。`;cancel();await load()}catch(e){error.value=e instanceof Error?e.message:'创建失败'}finally{form.currentCredential='';busy.value=false}}
onMounted(load);onBeforeUnmount(()=>{alive=false;form.newCredential='';form.currentCredential='';attempt=undefined})
</script>
<template>
<section class="owners-page">
 <header><div><h2>所有者与操作记录</h2><p>每位所有者独立登录。重要操作记录操作者、时间、对象及变更内容。</p></div><button @click="load" :disabled="loading">刷新记录</button></header>
 <p v-if="error" role="alert" class="error">{{error}}</p><p v-if="success" role="status">{{success}}</p>
 <article><h3>公司所有者</h3><p>所有者拥有最高后台权限；新账号继承当前所有者的应用与定价权限。请勿共用凭证。</p>
 <table><thead><tr><th>账号</th><th>姓名 / 显示名称</th><th>应用范围</th></tr></thead><tbody><tr v-for="owner in owners" :key="owner.id"><td>{{owner.id}}<small v-if="owner.id===auth.userInfo?.id">（当前账号）</small></td><td>{{owner.displayName}}</td><td>{{owner.applications.map(appLabel).join('、')}}</td></tr></tbody></table>
 <button class="primary" @click="showCreate=true" :disabled="!managed">创建公司所有者</button><p v-if="!managed">需先配置受保护的后台凭证文件。</p>
 </article>
 <article v-if="showCreate" aria-label="创建公司所有者"><h3>创建公司所有者</h3><p>请先为本人和合伙人分别选定账号。此操作授予最高后台权限，须重新验证当前凭证。</p>
 <form @submit.prevent="create"><div class="fields"><label>新所有者账号<input v-model="form.username" autocomplete="off" pattern="[A-Za-z0-9_-]{3,64}" maxlength="64" required></label><label>姓名 / 显示名称<input v-model="form.displayName" maxlength="80" required></label>
 <label>新所有者独立凭证<input v-model="form.newCredential" type="password" autocomplete="new-password" minlength="43" maxlength="128" required></label><div class="credential-actions"><button type="button" @click="generate">生成强随机凭证</button><button type="button" @click="copy" :disabled="!form.newCredential">复制新凭证</button></div>
 <label>当前所有者凭证<input v-model="form.currentCredential" type="password" autocomplete="current-password" maxlength="128" required></label><label>创建原因<input v-model="form.reason" minlength="8" maxlength="300" placeholder="说明用途，不要填写密码或验证码" required></label></div>
 <label class="confirm"><input v-model="form.confirmed" type="checkbox" required>我已核对账号，并确认授予与当前所有者相同的最高后台权限</label>
 <button type="button" @click="cancel" :disabled="busy">取消</button><button class="primary" type="submit" :disabled="busy||!form.confirmed">确认创建公司所有者</button></form></article>
 <article><h3>重要操作记录</h3><p>保存草稿与正式发布分别记录；仅发布或确认停售才影响新购买。记录不支持在控制台修改或删除。</p>
 <label>按操作者筛选<select aria-label="按操作者筛选" v-model="actor" @change="page=1;load()"><option value="">全部操作者</option><option v-for="owner in owners" :key="owner.id" :value="owner.id">{{owner.displayName}}（{{owner.id}}）</option></select></label>
 <div class="table-scroll"><table><thead><tr><th>时间</th><th>操作者</th><th>操作 / 对象</th><th>变更前</th><th>变更后</th><th>原因</th></tr></thead><tbody><tr v-for="e in events" :key="e.eventId"><td>{{new Date(e.occurredAt).toLocaleString()}}</td><td>{{e.actorId}}</td><td>{{actionLabel(e.action)}}<br>{{appLabel(e.application)}}<br><small>{{e.targetId}}</small></td><td>{{details(e.beforeDetails)}}</td><td>{{details(e.afterDetails)}}</td><td>{{e.reason}}</td></tr></tbody></table></div><p v-if="!events.length&&!loading">暂无重要操作记录。</p>
 <div class="paging"><button @click="page--;load()" :disabled="page<=1||loading">上一页</button><span>第{{page}}页 / 共{{total}}条</span><button @click="page++;load()" :disabled="page*20>=total||loading">下一页</button></div>
 </article>
</section>
</template>
<style scoped>
.owners-page{display:grid;gap:18px;color:#182335}.owners-page header{display:flex;align-items:center;justify-content:space-between}.owners-page h2{font-size:25px}.owners-page p{color:#65738a;line-height:1.7}.owners-page article{padding:24px;background:white;border:1px solid #e2e8f0;border-top:4px solid #748fff;border-radius:14px}.owners-page button{border:1px solid #dbe1ed;border-radius:7px;background:white;padding:10px 14px;margin:8px 8px 0 0;color:#263851;cursor:pointer}.owners-page button.primary{background:#2960ff;color:white;border-color:#2960ff}.owners-page button:disabled{opacity:.45;cursor:default}.owners-page label{display:grid;gap:8px;font-weight:600}.owners-page input:not([type=checkbox]),.owners-page select{width:100%;min-height:40px;border:1px solid #cdd7e5;border-radius:6px;padding:8px;background:white}.fields{display:grid;grid-template-columns:1fr 1fr;gap:18px}.owners-page .confirm{display:flex;margin:22px 0;align-items:center}.owners-page table{border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;text-align:left}.owners-page th,.owners-page td{border-bottom:1px solid #e6ebf3;padding:12px;vertical-align:top;overflow-wrap:anywhere}.owners-page small{color:#64748b}.table-scroll{overflow-x:auto}.paging{display:flex;align-items:center;gap:12px}.owners-page .error{color:#b42318}@media(max-width:800px){.fields{grid-template-columns:1fr}.owners-page header{display:block}}
</style>

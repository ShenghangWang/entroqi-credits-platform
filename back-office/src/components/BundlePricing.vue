<script setup lang="ts">
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue'
import {request} from '@/api/http'
import {useAuthStore} from '@/stores/auth'
const props=defineProps<{products:Array<{application:string;name:string}>}>(),auth=useAuthStore(),base='/platform/pricing/bundles'
type Rule={applications:string[];intervalMonths:number;discountBps:number;available:boolean;label:string;evidenceNote:string;validUntil:number}
type Version={id:string;rule_key:string;revision:number;published_version_id:string|null;payload:Rule;created_by:string}
const dialogElement=ref<HTMLDialogElement>()
const versions=ref<Version[]>([]),apps=ref<string[]>([]),months=ref(1),busy=ref(false),error=ref(''),message=ref(''),review=ref<Version>(),note=ref(''),confirmed=ref(false)
const form=reactive({discount:'0',available:true,label:'',evidenceNote:'',days:30})
const canWrite=computed(()=>auth.permissions.includes('pricing:write')),canPublish=computed(()=>auth.permissions.includes('pricing:publish'))
const key=(a:string[],m:number)=>JSON.stringify([[...a].sort(),m])
const matching=computed(()=>versions.value.filter(v=>key(v.payload.applications,v.payload.intervalMonths)===key(apps.value,months.value)).sort((a,b)=>b.revision-a.revision))
const configured=computed(()=>{const latest=new Map<string,Version>();for(const v of versions.value){const k=key(v.payload.applications,v.payload.intervalMonths);if(!latest.has(k)||latest.get(k)!.revision<v.revision)latest.set(k,v)}return [...latest.values()]})
function choose(v:Version){apps.value=[...v.payload.applications];months.value=v.payload.intervalMonths}
const current=computed(()=>matching.value.find(v=>v.id===v.published_version_id)),revision=computed(()=>matching.value[0]?.revision??0)
const names=(a:string[])=>a.map(id=>props.products.find(p=>p.application===id)?.name??id).join(' + ')
const period=(m:number)=>({1:'月付',3:'季付',12:'年付',24:'两年付'} as Record<number,string>)[m]
let saveAttempt:Record<string,unknown>|undefined,publishAttempt:Record<string,unknown>|undefined
async function refresh(){const r=await request.get<{data:{versions:Version[]}}>(base);versions.value=r.data.versions}
function load(v:Version){Object.assign(form,{discount:String(v.payload.discountBps/100),available:v.payload.available,label:v.payload.label,evidenceNote:v.payload.evidenceNote,days:Math.max(1,Math.ceil((v.payload.validUntil-Date.now())/86400000))});message.value='已载入修订，编辑与保存不会生效。'}
watch([apps,months],()=>{Object.assign(form,{discount:'0',available:true,label:'',evidenceNote:'',days:30});saveAttempt=undefined;error.value='';message.value='';if(current.value)load(current.value)},{deep:true})
watch(form,()=>{saveAttempt=undefined},{flush:'sync'})
watch(review,async v=>{if(v){await nextTick();dialogElement.value?.showModal()}})
watch(note,()=>{publishAttempt=undefined;confirmed.value=false})
async function save(){busy.value=true;error.value='';try{
 if(!/^\d{1,2}(\.\d{1,2})?$/.test(form.discount)||Number(form.discount)>99)throw Error('优惠比例填写 0–99%，最多两位小数。')
 saveAttempt??={rule:{applications:[...apps.value].sort(),intervalMonths:months.value,discountBps:Math.round(Number(form.discount)*100),available:form.available,label:form.label,evidenceNote:form.evidenceNote,validUntil:Date.now()+form.days*86400000},expectedRevision:revision.value,idempotencyKey:crypto.randomUUID()}
 await request.post(base+'/versions',saveAttempt);saveAttempt=undefined;await refresh();message.value='组合优惠草稿已保存，尚未生效。请复核后确认发布。'
 }catch(e){error.value=e instanceof Error?e.message:'保存失败'}finally{busy.value=false}}
function open(v:Version){review.value=v;note.value='';confirmed.value=false;publishAttempt=undefined}
async function publish(){if(!review.value)return;busy.value=true;error.value='';try{publishAttempt??={versionId:review.value.id,expectedPublishedId:review.value.published_version_id,note:note.value,idempotencyKey:crypto.randomUUID()};await request.post(base+'/publish',publishAttempt);review.value=undefined;publishAttempt=undefined;await refresh();message.value='组合优惠已确认发布；已接受的报价与已付权益保持原记录。'}catch(e){error.value=e instanceof Error?e.message:'发布失败'}finally{busy.value=false}}
onMounted(()=>refresh().catch(()=>{error.value='组合优惠暂不可用，请刷新重试。'}))
</script>
<template>
<section class="bundle-settings card" aria-label="多应用组合优惠">
 <h2>多应用组合优惠</h2><p>选择完整组合和统一付款周期，设置额外优惠。未配置的组合无额外优惠。不同组合不会叠加；各应用仍分别记录购买权益。</p>
 <p v-if="error" role="alert">{{error}}</p><p v-if="message" role="status">{{message}}</p>
 <div v-if="configured.length"><h3>已配置的组合</h3><div v-for="v in configured" :key="v.rule_key" class="bundle-version"><strong>{{names(v.payload.applications)}} · {{period(v.payload.intervalMonths)}}</strong><p>最新修订 {{v.revision}} · {{v.id===v.published_version_id?'已发布':'有待发布草稿'}}</p><button :disabled="busy" @click="choose(v)">编辑此组合</button></div></div>
 <fieldset :disabled="busy||!products.length"><legend>组合中的应用（至少两个）</legend><label v-for="p in products" :key="p.application" class="bundle-check"><input v-model="apps" type="checkbox" :value="p.application"/>{{p.name}}</label></fieldset>
 <label>组合付款周期<select v-model="months" :disabled="busy"><option v-for="m in [1,3,12,24]" :key="m" :value="m">{{period(m)}}</option></select></label>
 <p>当前发布：{{current?(current.payload.available?(current.payload.validUntil>Date.now()?`${current.payload.discountBps/100}% 优惠`:'优惠已过期，需复核'):'已停止组合优惠'):'尚未发布组合优惠'}}。原有单应用价格不变。</p>
 <fieldset :disabled="busy||!canWrite"><legend>编辑草稿</legend><label>组合名称<input v-model="form.label" maxlength="160"/></label><label>优惠比例（%）<input v-model="form.discount" inputmode="decimal"/></label><label class="bundle-check"><input v-model="form.available" type="checkbox"/>提供此组合优惠</label><label>复核有效天数<input v-model.number="form.days" type="number" min="1" max="365"/></label><label>优惠与成本复核说明<textarea v-model="form.evidenceNote" minlength="10" maxlength="2000"/></label><p>停售时取消勾选，保存草稿后确认发布。优惠后的各应用价格仍需通过已有成本测算，过期或不达标时不能生成可接受报价。</p><button :disabled="apps.length<2||!form.label.trim()||form.evidenceNote.trim().length<10" @click="save">保存组合优惠草稿</button></fieldset>
 <div v-for="v in matching" :key="v.id" class="bundle-version"><strong>修订 {{v.revision}} · {{v.payload.discountBps/100}}% · {{v.payload.available?'提供优惠':'停止优惠'}}</strong><p>{{v.id===v.published_version_id?'当前已发布':'未发布'}} · {{v.created_by}} · {{new Date(v.payload.validUntil).toLocaleString()}}</p><button :disabled="busy||!canWrite" @click="load(v)">载入组合修订</button><button :disabled="busy||!canPublish||v.id===v.published_version_id" @click="open(v)">复核组合发布</button></div>
 <p>修改和发布均会记入“所有者与操作记录”。实际收款仍需商户接入与验证。</p><button :disabled="busy" @click="refresh().catch(()=>{error='刷新失败'})">刷新组合优惠</button>
 <dialog v-if="review" ref="dialogElement" class="bundle-review" aria-label="确认发布组合优惠" @cancel="review=undefined"><h3>确认发布组合优惠</h3><p>{{names(review.payload.applications)}} · {{period(review.payload.intervalMonths)}} · {{review.payload.available?`${review.payload.discountBps/100}% 优惠`:'停止优惠'}}</p><p>发布后影响后续报价。已支付合同保持不变。</p><label>组合发布原因<textarea v-model="note" maxlength="1000"/></label><label class="bundle-check"><input v-model="confirmed" type="checkbox"/>我已核对完整组合、周期和优惠比例</label><button :disabled="busy" @click="review=undefined">取消</button><button :disabled="busy||!confirmed||note.trim().length<5" @click="publish">确认发布组合优惠</button></dialog>
</section>
</template>
<style scoped>
.bundle-settings{margin-top:24px;padding:24px;background:white;border:1px solid #dfe4ed;border-radius:12px}.bundle-settings fieldset{margin:16px 0;padding:16px;border:1px solid #dfe4ed;border-radius:8px}.bundle-settings label{display:grid;gap:8px;margin:12px 0;max-width:700px}.bundle-settings .bundle-check{display:flex;align-items:center;gap:10px}.bundle-settings input:not([type=checkbox]),.bundle-settings select,.bundle-settings textarea{padding:10px;border:1px solid #c6ccda;border-radius:6px;width:100%;box-sizing:border-box}.bundle-settings button{padding:10px 16px;margin:5px;background:#315fff;color:white;border:0;border-radius:6px}.bundle-settings button:disabled{opacity:.45}.bundle-version{padding:12px;border-top:1px solid #e0e5ed}.bundle-review{position:fixed;inset:10vh max(16px,15vw);padding:28px;background:#fff;border:1px solid #ccd3df;border-radius:12px;margin:auto;z-index:100;overflow:auto;max-height:75vh}.bundle-review::backdrop{background:#0008}.bundle-settings [role=alert]{color:#a51f35}
</style>

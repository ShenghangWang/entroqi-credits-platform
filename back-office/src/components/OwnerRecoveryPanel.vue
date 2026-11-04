<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
defineProps<{ mailReady: boolean }>()
const auth=useAuthStore(),route=useRoute()
const enrollmentStatus=ref('')
const canEnroll=computed(()=>auth.role==='developer' && auth.userInfo?.id==='company-owner')
const setup=ref(false),busy=ref(false),message=ref(''),error=ref('')
const email=ref(''),credential=ref(''),code=ref(''),backup=ref(''),challenge=ref(''),ticket=ref('')
const issuedBackup=ref(''),issuedCredential=ref(''),saved=ref(false),showSecrets=ref(false),activated=ref(false)
type Reply<T>={data:T}
onMounted(async()=>{if(canEnroll.value){try{const profile=await request.get<Reply<{status:string}>>('/auth/owner-recovery/profile');enrollmentStatus.value=profile.data.status}catch{/* Server-admin fallback remains available. */}}})
async function perform(action:()=>Promise<void>){busy.value=true;error.value='';try{await action()}catch(e){error.value=e instanceof Error?e.message:'操作失败，请重试。'}finally{busy.value=false}}
function switchMode(){setup.value=!setup.value;code.value='';backup.value='';challenge.value='';ticket.value='';issuedBackup.value='';issuedCredential.value='';credential.value='';saved.value=false;message.value='';error.value=''}
async function send(){await perform(async()=>{
  const result=await request.post<Reply<{challengeId:string;message:string}>>(setup.value?'/auth/owner-recovery/enroll/request':'/auth/owner-recovery/request',{email:email.value,...(setup.value?{currentCredential:credential.value}:{})})
  challenge.value=result.data.challengeId;message.value=result.data.message
})}
async function verify(){await perform(async()=>{
  if(setup.value){
    const result=await request.post<Reply<{offlineRecoveryCode:string}>>('/auth/owner-recovery/enroll/verify',{email:email.value,currentCredential:credential.value,challengeId:challenge.value,code:code.value})
    issuedBackup.value=result.data.offlineRecoveryCode;message.value='邮箱验证通过。请将离线恢复码单独保存在密码管理器或安全的离线位置，确认保存后才会启用邮箱恢复。'
  }else{
    const result=await request.post<Reply<{resetTicket:string}>>('/auth/owner-recovery/verify',{email:email.value,challengeId:challenge.value,code:code.value,offlineRecoveryCode:backup.value})
    ticket.value=result.data.resetTicket;backup.value='';message.value='恢复验证通过，请在5分钟内完成重置。'
  }
  code.value=''
})}
async function activate(){await perform(async()=>{
  await request.post('/auth/owner-recovery/enroll/activate',{currentCredential:credential.value,offlineRecoveryCode:issuedBackup.value})
  credential.value='';issuedBackup.value='';activated.value=true;enrollmentStatus.value='active';message.value='公司所有者邮箱恢复已启用。恢复时需要邮箱验证码和离线恢复码。'
})}
async function reset(){await perform(async()=>{
  const result=await request.post<Reply<{credential:string;offlineRecoveryCode:string}>>('/auth/owner-recovery/reset',{resetTicket:ticket.value})
  issuedCredential.value=result.data.credential;issuedBackup.value=result.data.offlineRecoveryCode;ticket.value='';saved.value=false
  await auth.logout(false);message.value='登录凭证已重置。旧凭证、旧会话和旧离线恢复码已失效。新凭证与新离线恢复码仅在此显示一次，请分别保存，然后重新登录。'
})}
function clearSensitive(){credential.value='';code.value='';backup.value='';ticket.value='';issuedBackup.value='';issuedCredential.value='';showSecrets.value=false}
onBeforeUnmount(clearSensitive)
watch(()=>route.path,clearSensitive)
</script>

<template>
  <section class="owner-recovery" aria-label="公司所有者邮箱恢复">
    <h3>公司所有者邮箱恢复</h3>
    <p>输入完整恢复邮箱和收到的验证码，并使用单独保存的离线恢复码。页面不会显示或提示已登记的邮箱地址。</p>
    <p v-if="!mailReady" class="status" role="status">邮件发送服务尚未配置。邮箱验证与邮件恢复暂未启用，授权运维恢复仍可使用。</p>
    <p v-if="canEnroll && enrollmentStatus === 'active'" role="status">恢复邮箱已验证，邮箱恢复已启用。请单独保管离线恢复码。</p>
    <button v-if="canEnroll && enrollmentStatus !== 'active' && !issuedCredential" type="button" class="text-action" @click="switchMode">{{ setup ? '返回账号恢复' : '首次设置：验证邮箱并保存离线恢复码' }}</button>
    <template v-if="!activated && !issuedCredential && !issuedBackup && !ticket">
      <form @submit.prevent="challenge ? verify() : send()">
        <label>完整恢复邮箱<input v-model="email" type="email" autocomplete="off" placeholder="请输入恢复邮箱" :disabled="busy || !mailReady" required /></label>
        <label v-if="setup">当前所有者登录凭证<input v-model="credential" type="password" autocomplete="current-password" :disabled="busy || !mailReady" required /></label>
        <template v-if="challenge">
          <label>邮件验证码<input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="8位验证码，10分钟内有效" :disabled="busy" required /></label>
          <label v-if="!setup">离线恢复码<input v-model="backup" type="password" autocomplete="off" placeholder="请输入单独保存的离线恢复码" :disabled="busy" required /></label>
        </template>
        <button class="primary" :disabled="busy || !mailReady">{{ busy ? '处理中…' : challenge ? '验证恢复信息' : '发送验证码' }}</button>
        <button v-if="challenge" type="button" class="text-action" :disabled="busy" @click="send">重新发送（旧验证码将失效）</button>
      </form>
    </template>
    <div v-if="ticket">
      <p>重置会生成新的高强度登录凭证，使旧凭证、已有会话及旧离线恢复码失效。</p>
      <button type="button" class="primary" :disabled="busy" @click="reset">重置所有者登录凭证</button>
    </div>
    <div v-if="issuedBackup">
      <label v-if="issuedCredential">新所有者登录凭证<input :value="issuedCredential" :type="showSecrets ? 'text':'password'" readonly autocomplete="off" /></label>
      <label>新的离线恢复码<input :value="issuedBackup" :type="showSecrets ? 'text':'password'" readonly autocomplete="off" /></label>
      <button type="button" class="text-action" @click="showSecrets=!showSecrets">{{ showSecrets ? '隐藏凭证与恢复码':'显示凭证与恢复码' }}</button>
      <label class="ack"><input v-model="saved" type="checkbox" />我已将凭证与离线恢复码分别安全保存。</label>
      <button v-if="setup && !issuedCredential" type="button" class="primary" :disabled="!saved || busy" @click="activate">确认保存并启用邮箱恢复</button>
      <RouterLink v-else-if="saved" to="/back-office/login">返回登录</RouterLink>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.owner-recovery{margin-top:16px;padding:16px;border:1px solid #dbe4ff;border-radius:10px;background:#f5f7ff;color:#475569;font-size:13px;line-height:1.65}.owner-recovery h3{font-size:16px;margin:0 0 8px;color:#0f172a}.owner-recovery label{display:block;margin:10px 0;font-weight:600}.owner-recovery input:not([type=checkbox]){display:block;width:100%;border:1px solid #d5dbea;border-radius:7px;padding:10px;margin-top:5px;background:white;font-weight:400}.primary{width:100%;padding:10px;border:0;border-radius:7px;background:#245eff;color:white}.primary:disabled{opacity:.5;cursor:not-allowed}.text-action{border:0;background:none;padding:8px 0;color:#245eff;text-align:left}.status{padding:10px;border-radius:6px;background:#fff8e6;color:#875d13}.error{color:#b42318}.ack{display:flex!important;gap:8px;align-items:start}.owner-recovery a{color:#245eff}
</style>
